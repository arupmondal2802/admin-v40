import React, { useState, useEffect, useRef } from 'react';
import { Service, ServiceTemplate } from '../../types';
import { IconSparkles, IconX, IconLoader } from '../ui/Icon';
import Button from '../ui/Button';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (service: Partial<Service>) => void;
  serviceTemplates: ServiceTemplate[];
}

const ChatbotModal: React.FC<Props> = ({ isOpen, onClose, onSubmit, serviceTemplates }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  useEffect(() => {
    if (isOpen) {
      setMessages([{
        role: 'model',
        text: "Hello! I'm your AI assistant. I can help you create a new service order. To start, what's the customer's first name?"
      }]);
    }
  }, [isOpen]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!userInput.trim() || isLoading) return;

    const newUserMessage: ChatMessage = { role: 'user', text: userInput };
    const newMessages = [...messages, newUserMessage];
    setMessages(newMessages);
    setUserInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/.netlify/functions/chat-with-bot', {
        method: 'POST',
        body: JSON.stringify({
          messages: newMessages,
          serviceTemplates
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'An error occurred.');
      }
      
      const aiResponseText = data.reply;
      const jsonRegex = /```json\s*([\s\S]*?)\s*```/;
      const match = aiResponseText.match(jsonRegex);

      if (match && match[1]) {
        try {
          const parsedJson = JSON.parse(match[1]);
          onSubmit(parsedJson);
          onClose(); // Close modal on successful submission
        } catch (parseError) {
          console.error("Failed to parse JSON from AI:", parseError);
          const errorMessage: ChatMessage = { role: 'model', text: "I had trouble finalizing the details. Could you please clarify the last point?" };
          setMessages(prev => [...prev, errorMessage]);
        }
      } else {
        const newAiMessage: ChatMessage = { role: 'model', text: aiResponseText };
        setMessages(prev => [...prev, newAiMessage]);
      }

    } catch (error) {
      console.error("Chatbot error:", error);
      const errorMessage: ChatMessage = { role: 'model', text: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment." };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 modal-backdrop" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-xl shadow-2xl flex flex-col h-[80vh] max-h-[700px] modal-content">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-slate-50 border-b border-slate-200 rounded-t-xl">
          <div className="flex items-center space-x-3">
            <IconSparkles className="w-6 h-6 text-brand-accent" />
            <h2 className="text-lg font-bold text-slate-800">AI Service Assistant</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full text-slate-400 hover:bg-slate-200">
            <IconX className="w-6 h-6" />
          </button>
        </div>

        {/* Message Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-100">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && <div className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0"><IconSparkles className="w-5 h-5 text-white"/></div>}
              <div className={`max-w-[80%] px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-brand-accent text-brand-blue rounded-br-none' : 'bg-white text-slate-700 rounded-bl-none border'}`}>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-end gap-2 justify-start">
               <div className="w-8 h-8 rounded-full bg-brand-blue flex items-center justify-center flex-shrink-0"><IconSparkles className="w-5 h-5 text-white"/></div>
               <div className="max-w-[80%] px-4 py-3 rounded-2xl bg-white text-slate-700 rounded-bl-none border">
                    <div className="flex items-center space-x-1">
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-0"></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-150"></span>
                        <span className="w-2 h-2 bg-slate-400 rounded-full animate-pulse delay-300"></span>
                    </div>
               </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-200 bg-white rounded-b-xl">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type your message..."
              disabled={isLoading}
              className="w-full px-4 py-2 border border-slate-300 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-accent"
            />
            <Button type="submit" disabled={isLoading || !userInput.trim()} className="rounded-full !px-4 !py-2">
              {isLoading ? <IconLoader className="w-5 h-5 animate-spin" /> : 'Send'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ChatbotModal;