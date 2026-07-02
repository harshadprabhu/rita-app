export const ROUTES = {
  // Auth
  LOGIN: '/(auth)/login',
  FORGOT_PASSWORD: '/(auth)/forgot-password',
  ONBOARDING_STORE: '/onboarding-store',
  PENDING_APPROVAL: '/pending-approval',

  // User (store staff)
  USER_HOME: '/(user)/home',
  USER_TICKETS: '/(user)/tickets',
  USER_CHAT: '/(user)/chat',
  USER_NOTIFICATIONS: '/(user)/notifications',
  USER_PROFILE: '/(user)/profile',

  // Manager
  MANAGER_HOME: '/(manager)/home',
  MANAGER_ALL_TICKETS: '/(manager)/all-tickets',
  MANAGER_CHAT: '/(manager)/chat',
  MANAGER_NOTIFICATIONS: '/(manager)/notifications',
  MANAGER_PROFILE: '/(manager)/profile',

  // Technician
  TECHNICIAN_HOME: '/(technician)/home',
  TECHNICIAN_MY_TICKETS: '/(technician)/my-tickets',
  TECHNICIAN_ALL_TICKETS: '/(technician)/all-tickets',
  TECHNICIAN_CHAT: '/(technician)/chat',
  TECHNICIAN_NOTIFICATIONS: '/(technician)/notifications',
  TECHNICIAN_PROFILE: '/(technician)/profile',

  // Admin
  ADMIN_HOME: '/(admin)/home',
  ADMIN_ALL_TICKETS: '/(admin)/all-tickets',
  ADMIN_SLA: '/(admin)/sla-console',
  ADMIN_ACCOUNTS: '/(admin)/accounts',
  ADMIN_ANALYTICS: '/(admin)/analytics',
  ADMIN_CHAT: '/(admin)/chat',
  ADMIN_NOTIFICATIONS: '/(admin)/notifications',
  ADMIN_PROFILE: '/(admin)/profile',

  // Shared
  TICKET_DETAIL: (id: string) => `/tickets/${id}` as const,
  CREATE_TICKET: '/create-ticket',
  CHAT_THREAD: (channelId: string) => `/chat/${channelId}` as const,
} as const;
