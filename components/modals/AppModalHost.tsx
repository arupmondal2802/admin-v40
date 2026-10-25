import React, { Suspense, lazy } from 'react';
import { Service, User, ServiceTemplate } from '../../types';

const SummaryModal = lazy(() => import('../SummaryModal').then(m => ({ default: m.SummaryModal })));
const ShareOrderModal = lazy(() => import('../ShareOrderModal').then(m => ({ default: m.ShareOrderModal })));
const DeleteConfirmationModal = lazy(() => import('../dashboard/DeleteConfirmationModal'));
const CancelOrderModal = lazy(() => import('../dashboard/CancelOrderModal').then(m => ({ default: m.CancelOrderModal })));
const DiagnosticOverlay = lazy(() => import('../ui/DiagnosticOverlay').then(m => ({ default: m.DiagnosticOverlay })));
const ChatbotModal = lazy(() => import('../chatbot/ChatbotModal'));

export interface AppModalHostProps {
  summarizingService: Service | null;
  onCloseSummary: () => void;
  sharingService: Service | null;
  onCloseShare: () => void;
  deletingService: Service | null;
  onCloseDelete: () => void;
  onConfirmDelete: (service: Service, reason: string, locationStamp: string, timestamp: string) => void;
  cancelingService: Service | null;
  onCloseCancel: () => void;
  onConfirmCancel: (service: Service, reason: string, locationStamp: string, timestamp: string) => void;
  isDiagnosticOverlayOpen: boolean;
  onCloseDiagnostic: () => void;
  googleSheetsUrl?: string;
  currentUser: User | null;
  isChatbotOpen?: boolean;
  onCloseChatbot?: () => void;
  onSubmitChatbot?: (service: Partial<Service>) => void;
  serviceTemplates?: ServiceTemplate[];
}

export const AppModalHost: React.FC<AppModalHostProps> = ({
  summarizingService,
  onCloseSummary,
  sharingService,
  onCloseShare,
  deletingService,
  onCloseDelete,
  onConfirmDelete,
  cancelingService,
  onCloseCancel,
  onConfirmCancel,
  isDiagnosticOverlayOpen,
  onCloseDiagnostic,
  googleSheetsUrl,
  currentUser,
  isChatbotOpen,
  onCloseChatbot,
  onSubmitChatbot,
  serviceTemplates = []
}) => {
  return (
    <Suspense fallback={null}>
      {summarizingService && (
        <SummaryModal 
          service={summarizingService} 
          onClose={onCloseSummary} 
        />
      )}

      {sharingService && (
        <ShareOrderModal 
          service={sharingService} 
          onClose={onCloseShare} 
        />
      )}

      {deletingService && currentUser && (
        <DeleteConfirmationModal
          isOpen={!!deletingService}
          service={deletingService}
          currentUser={currentUser}
          onClose={onCloseDelete}
          onConfirm={(reason, loc, ts) => {
            onConfirmDelete(deletingService, reason, loc, ts);
          }}
        />
      )}

      {cancelingService && currentUser && (
        <CancelOrderModal
          isOpen={!!cancelingService}
          service={cancelingService}
          currentUser={currentUser}
          onClose={onCloseCancel}
          onConfirm={(reason, loc, ts) => {
            onConfirmCancel(cancelingService, reason, loc, ts);
          }}
        />
      )}

      {isDiagnosticOverlayOpen && (
        <DiagnosticOverlay
          isOpen={isDiagnosticOverlayOpen}
          onClose={onCloseDiagnostic}
          googleSheetsUrl={googleSheetsUrl}
        />
      )}

      {isChatbotOpen && onCloseChatbot && onSubmitChatbot && (
        <ChatbotModal
          isOpen={isChatbotOpen}
          onClose={onCloseChatbot}
          onSubmit={onSubmitChatbot}
          serviceTemplates={serviceTemplates}
        />
      )}
    </Suspense>
  );
};

export default AppModalHost;
