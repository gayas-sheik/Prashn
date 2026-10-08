import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { 
  ArrowLeft, 
  MessageSquare, 
  Send, 
  Sparkles, 
  Copy, 
  Check, 
  Trash2, 
  Download, 
  FileText, 
  ShieldCheck, 
  CheckCircle2,
  Bookmark,
  Layers
} from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import type { DocumentItem, QAMessage, QACitation } from '../../types';
import { getDocument, getConversation, askQuestion, getSuggestedPrompts } from '../../services/api/documentService';

export const DocumentQAPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [document, setDocument] = useState<DocumentItem | null>(null);
  const [messages, setMessages] = useState<QAMessage[]>([]);
  const [suggestedPrompts, setSuggestedPrompts] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [sending, setSending] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initData = async () => {
      if (id) {
        const doc = await getDocument(id);
        setDocument(doc);
        const conv = await getConversation(id);
        setMessages(conv);
        const prompts = await getSuggestedPrompts(id);
        setSuggestedPrompts(prompts);
      }
    };
    initData();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const handleSend = async (questionText?: string) => {
    const textToSend = questionText || inputValue;
    if (!textToSend.trim() || sending || !id) return;

    const userMsg: QAMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: 'Just now',
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!questionText) setInputValue('');
    setSending(true);

    const assistantMsg = await askQuestion(id, textToSend);
    setMessages((prev) => [...prev, assistantMsg]);
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClear = () => {
    setMessages([]);
  };

  const handleExport = () => {
    const transcript = messages
      .map((m) => `[${m.timestamp}] ${m.sender.toUpperCase()}:\n${m.text}\n`)
      .join('\n---\n\n');
    const blob = new Blob([transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = `qa_transcript_${id}_${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };


  if (!document) {
    return (
      <div className="py-24 text-center">
        <h2 className="text-[18px] font-bold text-[#0F172A] dark:text-[#F8FAFC]">Document Not Found</h2>
        <Button variant="secondary" className="mt-4" onClick={() => navigate('/documents')}>
          Back to Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* Top Header & Breadcrumbs */}
      <div className="space-y-2 pb-2 border-b border-[#E2E8F0] dark:border-[#334155]">
        <div className="flex items-center gap-2 text-[12px] text-[#64748B] dark:text-[#94A3B8]">
          <Link to={`/documents/${document.id}`} className="hover:text-[#1E40AF] flex items-center gap-1 font-medium">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Inspection
          </Link>
          <span>/</span>
          <span>System</span>
          <span>/</span>
          <Link to="/documents" className="hover:text-[#1E40AF]">Documents</Link>
          <span>/</span>
          <span className="font-mono text-[#0F172A] dark:text-[#F8FAFC]">{document.name}</span>
          <span>/</span>
          <span className="font-semibold text-[#1E40AF] dark:text-[#60A5FA]">Document Q&A</span>
        </div>

        {/* Document Banner */}
        <div className="p-3 rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-none">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-[4px] bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#60A5FA]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-[15px] text-[#0F172A] dark:text-[#F8FAFC]">
                  {document.name}
                </span>
                <span className="px-2 py-0.2 rounded-[2px] bg-[#F1F5F9] dark:bg-[#334155] text-[#334155] dark:text-[#CBD5E1] text-[11px] font-mono">
                  {document.type}
                </span>
                <span className="text-[11px] text-[#64748B] dark:text-[#94A3B8] font-mono">
                  {document.pagesCount} Pages · S3 Encrypted
                </span>
              </div>
              <div className="text-[11px] text-[#059669] flex items-center gap-1 font-medium mt-0.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Processed & Indexed in Cloud Vault</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#1E40AF] dark:text-[#93C5FD] bg-[#EFF6FF] dark:bg-[#1E3A8A30] border border-[#BFDBFE] dark:border-[#1E40AF] px-2.5 py-1 rounded-[4px] font-medium flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Strictly Grounded in OCR Payload (Zero Hallucinations)
            </span>
          </div>
        </div>
      </div>

      {/* Split Workspace Layout (40% Left Citation Reference, 60% Right Chat) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column (5 cols ~ 40%): Document Reference & Cited Sources */}
        <div className="lg:col-span-5 space-y-4">
          {/* Card 1: Pinned Key Extraction Metrics */}
          <Card
            title={
              <div className="flex items-center gap-1.5">
                <Bookmark className="w-4 h-4 text-[#1E40AF] dark:text-[#60A5FA]" />
                <span>Document Grounding Context</span>
              </div>
            }
            subtitle="Extracted key-values available for citations"
          >
            <div className="space-y-2 text-[12px]">
              {document.extractedFields?.slice(0, 4).map((f, i) => (
                <div key={i} className="p-2.5 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] flex justify-between items-center">
                  <span className="text-[#64748B]">{f.label}:</span>
                  <span className="font-semibold text-[#0F172A] dark:text-[#F8FAFC]">
                    {f.value}
                  </span>
                </div>
              ))}
              {(!document.extractedFields || document.extractedFields.length === 0) && (
                 <div className="p-2.5 rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#E2E8F0] dark:border-[#2D3F5A] flex justify-between items-center">
                 <span className="text-[#64748B]">No key metrics extracted yet.</span>
               </div>
              )}
            </div>
          </Card>

          {/* Card 2: Document Image/File Preview */}
          <Card
            title={
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-[#1E40AF] dark:text-[#60A5FA]" />
                <span>Original Document</span>
              </div>
            }
            subtitle="Original uploaded file"
            noPadding
          >
            <div className="w-full bg-[#64748B10] h-[400px] flex items-center justify-center overflow-hidden">
                {document.mimeType?.startsWith('image/') ? (
                <img 
                    src={`http://localhost:5000/api/documents/${document.id}/file?token=${localStorage.getItem('token')}`} 
                    alt={document.name} 
                    className="max-w-full max-h-full object-contain" 
                    onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    }}
                />
                ) : (
                <embed 
                    src={`http://localhost:5000/api/documents/${document.id}/file?token=${localStorage.getItem('token')}`} 
                    type={document.mimeType} 
                    className="w-full h-full" 
                />
                )}
            </div>
          </Card>
        </div>

        {/* Right Column (7 cols ~ 60%): Enterprise Document Q&A Chat */}
        <div className="lg:col-span-7">
          <Card noPadding className="flex flex-col h-[700px]">
            {/* Chat Header Actions */}
            <div className="p-3 border-b border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#1E40AF] dark:text-[#60A5FA]" />
                <span className="font-semibold text-[13px] text-[#0F172A] dark:text-[#F8FAFC]">
                  Conversational Q&A Thread
                </span>
                <span className="text-[11px] text-[#64748B] font-mono">
                  ({messages.length} messages)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="tertiary"
                  icon={<Download className="w-3 h-3" />}
                  onClick={handleExport}
                  title="Export Transcript"
                >
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="tertiary"
                  icon={<Trash2 className="w-3 h-3 text-[#E11D48]" />}
                  onClick={handleClear}
                  title="Clear Conversation"
                >
                  Clear
                </Button>
              </div>
            </div>

            {/* Suggested Prompts Bar */}
            <div className="p-2.5 border-b border-[#E2E8F0] dark:border-[#334155] bg-[#F8FAFC] dark:bg-[#162032] flex items-center gap-1.5 overflow-x-auto text-[11px]">
              <span className="text-[#64748B] dark:text-[#94A3B8] flex items-center gap-1 font-medium whitespace-nowrap pl-1">
                <Sparkles className="w-3.5 h-3.5 text-[#1E40AF]" />
                Suggested:
              </span>
              {suggestedPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(p)}
                  disabled={sending}
                  className="px-2.5 py-1 rounded-[4px] bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569] text-[#334155] dark:text-[#CBD5E1] hover:border-[#1E40AF] hover:text-[#1E40AF] whitespace-nowrap transition-colors text-left flex-shrink-0"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Messages Thread Container */}
            <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-[#F8FAFC20] dark:bg-[#121B2B]">
              {messages.length === 0 ? (
                <div className="text-center py-16 text-[#64748B] dark:text-[#94A3B8]">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="font-semibold text-[14px]">No questions asked yet.</p>
                  <p className="text-[12px] mt-1 max-w-sm mx-auto">
                    Select a suggested question above or type any query regarding dates, vendors, line items, and totals.
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-[#64748B]">
                        <span className="font-medium">
                          {isUser ? 'You (Alex Parker)' : 'Prashn AI Assistant'}
                        </span>
                        <span>·</span>
                        <span className="font-mono">{msg.timestamp}</span>
                      </div>

                      <div
                        className={`max-w-[85%] rounded-[6px] p-3.5 text-[13px] leading-relaxed relative group ${
                          isUser
                            ? 'bg-[#1E40AF] text-white shadow-none'
                            : 'bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] text-[#0F172A] dark:text-[#F8FAFC]'
                        }`}
                      >
                        {/* Message content */}
                        <div
                          className="prose prose-sm dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
                          }}
                        />

                        {/* Citation tag if attached */}
                        {msg.citations && msg.citations.length > 0 && (
                          <div className="mt-2.5 pt-2 border-t border-[#E2E8F0] dark:border-[#334155] flex flex-wrap gap-1.5">
                            {msg.citations.map((c, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-[#EFF6FF] dark:bg-[#1E3A8A40] text-[#1E40AF] dark:text-[#93C5FD] border border-[#BFDBFE] dark:border-[#1E40AF] text-[10px] font-mono"
                                title={c.snippet}
                              >
                                [Source: Page {c.page}, {c.section}]
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Copy button */}
                        {!isUser && (
                          <button
                            onClick={() => handleCopy(msg.text, msg.id)}
                            title="Copy answer"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-[2px] text-[#64748B] hover:text-[#0F172A] dark:hover:text-white transition-opacity bg-white dark:bg-[#1E293B] border border-[#CBD5E1] dark:border-[#475569]"
                          >
                            {copiedId === msg.id ? (
                              <Check className="w-3 h-3 text-[#059669]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}

              {sending && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-2 mb-1 px-1 text-[11px] text-[#64748B]">
                    <span>Prashn Assistant</span>
                    <span>·</span>
                    <span>Searching vectors...</span>
                  </div>
                  <div className="bg-white dark:bg-[#1E293B] border border-[#E2E8F0] dark:border-[#334155] rounded-[6px] p-3 text-[13px] flex items-center gap-2 text-[#64748B]">
                    <span className="w-2 h-2 rounded-full bg-[#1E40AF] animate-ping" />
                    <span>Analyzing document OCR payload...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input Toolbar & Box */}
            <div className="p-3 border-t border-[#E2E8F0] dark:border-[#334155] bg-white dark:bg-[#1E293B]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`Ask any question grounded in ${document.name}...`}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={sending}
                  className="flex-1 h-[40px] px-3.5 text-[13px] rounded-[4px] bg-[#F8FAFC] dark:bg-[#162032] border border-[#CBD5E1] dark:border-[#475569] text-[#0F172A] dark:text-[#F8FAFC] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#1E40AF]"
                />

                <Button
                  variant="primary"
                  size="md"
                  icon={<Send className="w-3.5 h-3.5" />}
                  onClick={() => handleSend()}
                  loading={sending}
                  disabled={!inputValue.trim()}
                >
                  Send
                </Button>
              </div>

              <div className="flex items-center justify-between text-[11px] text-[#64748B] dark:text-[#94A3B8] mt-2 px-1 font-mono">
                <span>Press Enter ↵ to send question</span>
                <span>Grounding: Textract Tables + Form Blocks</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
