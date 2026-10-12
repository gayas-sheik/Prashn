const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
let collectMonitoring, sanitizedLog, server, base, adminToken, userToken, staleToken, db;

before(async () => {
  const output = path.resolve(__dirname, '../.test-output');
  await fs.mkdir(output, { recursive: true });
  const run = await fs.mkdtemp(path.join(output, 'monitoring-'));
  Object.assign(process.env, { DB_FILE: path.join(run, 'test.db'), UPLOAD_DIR: path.join(run, 'uploads'), PROCESSED_DIR: path.join(run, 'processed'),
    JWT_SECRET: randomBytes(48).toString('hex'), STORAGE_MODE: 'local', DATABASE_MODE: 'local', PROCESSING_MODE: 'local', MONITORING_STACK_NAME: '' });
  ({ collectMonitoring, sanitizedLog } = require('../dist/services/monitoring.service'));
  db = await require('../dist/database/db').getDb();
  const Users = require('../dist/repositories/user.repository').UserRepository;
  const users = new Users();
  for (const [id, role] of [['admin-fixture', 'admin'], ['user-fixture', 'user']]) {
    await users.createUser({ id, role, email: `${id}@example.test`, fullName: 'Fixture', passwordHash: 'not-used-by-this-token-test', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  const jwt = require('jsonwebtoken');
  const sign = (userId, role) => jwt.sign({ userId, role, email: `${userId}@example.test` }, process.env.JWT_SECRET, { expiresIn: '5m' });
  adminToken = sign('admin-fixture', 'admin'); userToken = sign('user-fixture', 'user'); staleToken = sign('user-fixture', 'admin');
  server = require('../dist/app').default.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); });

function reader(overrides = {}) {
  const calls = [];
  const resources = { ApiGroup: 'stack-api', WorkerGroup: 'stack-worker', Jobs: 'https://sqs.us-east-1.amazonaws.com/123456789012/jobs',
    DeadLetters: 'https://sqs.us-east-1.amazonaws.com/123456789012/dlq', ApplicationLogs: '/prashn/stack/application', HttpApi: 'fixture-api',
    QueueBacklog: 'stack-backlog', QueueIdle: 'stack-idle', DeadLetterAlarm: 'stack-dlq', ApiErrors: 'stack-errors' };
  const outputs = { ApiGroup: resources.ApiGroup, WorkerGroup: resources.WorkerGroup, QueueUrl: resources.Jobs, DeadLetterQueue: resources.DeadLetters, ApplicationLogGroup: resources.ApplicationLogs };
  return { calls, resources, queueUrl: resources.Jobs, async call(service, operation, input) {
    calls.push({ service, operation, input });
    if (overrides[`${service}/${operation}`]) return overrides[`${service}/${operation}`](input);
    if (operation === 'stacks') return { Stacks: [{ StackStatus: 'UPDATE_COMPLETE', Outputs: Object.entries(outputs).map(([OutputKey, OutputValue]) => ({ OutputKey, OutputValue })) }] };
    if (operation === 'resources') return { StackResources: Object.entries(resources).map(([LogicalResourceId, PhysicalResourceId]) => ({ LogicalResourceId, PhysicalResourceId })) };
    if (service === 'asg') return { AutoScalingGroups: [resources.ApiGroup, resources.WorkerGroup].map(AutoScalingGroupName => ({ AutoScalingGroupName, MinSize: 0, MaxSize: 0, DesiredCapacity: 0, Instances: [] })) };
    if (service === 'queue') return { Attributes: { ApproximateNumberOfMessages: '0', ApproximateNumberOfMessagesNotVisible: '0', ApproximateNumberOfMessagesDelayed: '0' } };
    if (operation === 'alarms') return { MetricAlarms: input.AlarmNames.map(AlarmName => ({ AlarmName, StateValue: 'INSUFFICIENT_DATA' })) };
    if (operation === 'data') return { MetricDataResults: input.MetricDataQueries.map(row => ({ Id: row.Id, StatusCode: 'Complete', Timestamps: [], Values: [] })) };
    if (service === 'logs') return { events: [] };
    throw Error('Unexpected operation');
  } };
}

test('monitoring enforces authentication/current database admin role; local mode is honest', async () => {
  const request = token => fetch(base + '/api/monitoring', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  assert.equal((await request()).status, 401);
  assert.equal((await request(userToken)).status, 403);
  assert.equal((await request(staleToken)).status, 403);
  const response = await request(adminToken);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).enabled, false);
  await db.run("UPDATE users SET role='user' WHERE id='admin-fixture'");
  assert.equal((await request(adminToken)).status, 403);
});

test('snapshot pins queries to resolved stack; missing samples stay empty rather than zero', async () => {
  const transport = reader();
  const result = await collectMonitoring(transport, 'stack', transport.queueUrl, new Date('2026-10-12T12:00:00Z'));
  assert.equal(result.fleet.status, 'ok'); assert.equal(result.fleet.data[0].instances.length, 0);
  assert.equal(result.queues.data[0].visible, 0); assert.equal(result.alarms.data[0].state, 'INSUFFICIENT_DATA');
  assert.equal(result.metrics.data[0].points.length, 0);
  assert.deepEqual(transport.calls.find(row => row.service === 'asg').input.AutoScalingGroupNames, ['stack-api', 'stack-worker']);
  assert.equal(transport.calls.find(row => row.service === 'logs').input.logGroupName, '/prashn/stack/application');
  assert.ok(transport.calls.every(row => !/Create|Update|Delete|Put|Receive|SendMessage|SetDesired/.test(row.operation)));
});

test('foreign queue binding aborts before fleet, metrics, queues or log reads', async () => {
  const transport = reader();
  await assert.rejects(collectMonitoring(transport, 'stack', 'https://sqs.us-east-1.amazonaws.com/other/foreign'), /binding unavailable/);
  assert.ok(transport.calls.every(row => row.service === 'cfn'));
});

test('partial failures cannot produce healthy fleets, fake zero queues or leak AWS exception text', async () => {
  const transport = reader({ 'asg/groups': () => ({ AutoScalingGroups: [] }), 'queue/attributes': () => { throw Object.assign(Error('PRIVATE SIGNED URL'), { name: 'AccessDeniedException' }); } });
  const result = await collectMonitoring(transport, 'stack', transport.queueUrl);
  assert.equal(result.fleet.status, 'unavailable'); assert.equal(result.queues.status, 'unavailable');
  assert.equal(result.queues.data, null); assert.match(result.queues.message, /permission/);
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('log projection omits identities, content, credentials, paths and arbitrary unstructured output', () => {
  const result = sanitizedLog({ timestamp: 1791806400000, message: JSON.stringify({ event: 'job_attempt_failed', errorType: 'Error',
    documentId: 'PRIVATE-DOC', userId: 'PRIVATE-USER', text: 'PRIVATE-CONTENT', token: 'PRIVATE-TOKEN', message: 'PRIVATE-SIGNED-URL' }) });
  assert.equal(result.event, 'job_attempt_failed'); assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.equal(sanitizedLog({ timestamp: 1, message: 'JWT_SECRET=PRIVATE' }), null);
  assert.equal(sanitizedLog({ timestamp: 1, message: '{"event":"job_completed","text":"PRIVATE"}' }), null);
  assert.equal(sanitizedLog({ timestamp: 1, message: '{"event":"http_request","status":200}' }), null);
  assert.equal(sanitizedLog({ timestamp: 1, message: '{"event":"http_request","status":503}' }).status, 503);
});

test('log pagination is bounded and explicitly incomplete; timestamps and real metric values survive', async () => {
  const transport = reader({ 'logs/events': () => ({ events: [], nextToken: 'more' }), 'metrics/data': input => ({ MetricDataResults: input.MetricDataQueries.map(row => ({
    Id: row.Id, StatusCode: 'PartialData', Values: [7], Timestamps: [new Date('2026-10-12T11:55:00Z')] })) }) });
  const result = await collectMonitoring(transport, 'stack', transport.queueUrl);
  assert.equal(transport.calls.filter(row => row.service === 'logs').length, 4);
  assert.equal(result.errors.data.truncated, true);
  assert.equal(result.metrics.data[0].points[0].value, 7);
  assert.equal(result.metrics.data[0].complete, false);
});
