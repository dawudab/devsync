import { isFirebaseConfigured } from '@/config/firebase';
import { createFirestoreBackend } from './firestoreBackend';
import { createLocalBackend } from './localBackend';

/**
 * Backend contract (implemented by both firestoreBackend and localBackend):
 *
 * mode: 'firebase' | 'demo'
 * Auth:       onAuthChange(cb), signInWithGoogle(), signInAsGuest(name), signOut()
 * Workspaces: subscribeMyWorkspaces(uid, cb), subscribeWorkspace(wsId, cb), createWorkspace(user, name), joinWorkspace(code)
 * Feed:       subscribeUpdates(wsId, cb), toggleReaction(wsId, updateId, emoji, uid, currentlyActive), retranslateUpdate(wsId, updateId), translatePreview(wsId, change)
 * Comments:   subscribeComments(wsId, updateId, cb), addComment(wsId, updateId, { text, parentId }, author)
 * Tickets:    subscribeTickets(wsId, cb), createTicket(wsId, data, author), updateTicket(wsId, ticketId, patch, actor, activityEntry?)
 * GitHub:     startGithubInstall(wsId), selectRepository(wsId, repoId), disconnectGithub(wsId), subscribeWebhookLogs(wsId, cb)
 * Testing:    simulateEvent(wsId)
 *
 * All subscribe* functions return an unsubscribe function and deliver plain objects with
 * `createdAt`/`updatedAt` as epoch milliseconds.
 */
export const backend = isFirebaseConfigured ? createFirestoreBackend() : createLocalBackend();
