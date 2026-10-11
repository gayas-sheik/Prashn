"""Repair the existing deployment role, continue rollback, and pause compute.

Run only in the owner's prashn-admin CloudShell. No resource skipping, new
application stack, data deletion, or frontend publication. Rollback can launch
the previous workload temporarily; final cleanup drains and pauses it again.
"""
import argparse
from types import SimpleNamespace

from cd_release import Delivery
from setup_github_oidc import Setup
from verify_deployment import require


class Recovery(Delivery):
    def recover(self):
        self.preflight(allow_rollback_complete=True, allow_rollback_failed=True)
        identity = self.aws('sts', 'get-caller-identity')
        require(identity['Arn'] == f'arn:aws:iam::{self.args.account}:user/prashn-admin',
                'Rollback recovery must use the existing prashn-admin operator session')
        stack = self.stack()
        require(not stack.get('RoleARN'), 'Unexpected CloudFormation service role; review recovery separately')
        require(self.queue_idle(), 'Drain processing jobs before recovering the demo stack')
        self.group_state()  # Reject a partial/unrelated fleet binding.
        if stack['StackStatus'] == 'UPDATE_ROLLBACK_FAILED':
            print('Continuing the existing rollback without skipping resources; previous servers may start temporarily.', flush=True)
            self.aws('cloudformation', 'continue-update-rollback', '--stack-name', self.args.stack)
            stack = self.wait_stack(2700, expected_digest='rollback-recovery',
                                    previous_updated=stack.get('LastUpdatedTime', stack.get('CreationTime')),
                                    previous_status='UPDATE_ROLLBACK_FAILED')
            require(stack['StackStatus'] == 'UPDATE_ROLLBACK_COMPLETE',
                    'Rollback did not complete; inspect CloudFormation events. No new delivery started')
        return 'Existing stack is ' + stack['StackStatus'] + '; no resources skipped and no new release deployed'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--account', required=True)
    args = parser.parse_args()
    if args.account != '683146427271':
        parser.error('Recovery is bound to account 683146427271')
    args.stack, args.region, args.command = 'prashn-cloud-v2', 'us-east-1', 'recover'
    audit = Recovery(args)
    ok = False
    try:
        identity = audit.aws('sts', 'get-caller-identity')
        require(identity['Arn'] == f'arn:aws:iam::{args.account}:user/prashn-admin', 'Use prashn-admin CloudShell for recovery')
        setup = Setup(SimpleNamespace(account=args.account, stack=args.stack))
        bindings = setup.plan()
        setup.apply(bindings)
        ok = audit.check('Existing stack rollback recovery', audit.recover)
    finally:
        # Also attempt cost cleanup after another stopped rollback failure.
        # safe_pause never interrupts an active stack operation or busy queue.
        paused = audit.check('Final recovery compute pause', audit.safe_pause)
        audit.finished = True
        audit.save()
    return 0 if ok and paused else 1


if __name__ == '__main__':
    raise SystemExit(main())
