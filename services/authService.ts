
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  plan: 'free' | 'pro';
}

const STORAGE_KEY = 'betmind_user_session';

export const authService = {
  // Simule une connexion Google (Popup UX)
  loginWithGoogle: async (): Promise<User> => {
    return new Promise((resolve) => {
      // Simulation délai réseau
      setTimeout(() => {
        const mockGoogleUser: User = {
          id: 'google_' + Date.now(),
          name: 'Utilisateur Google',
          email: 'user@gmail.com',
          avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c', // Avatar Google par défaut
          plan: 'free' // Par défaut
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(mockGoogleUser));
        resolve(mockGoogleUser);
      }, 1500);
    });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  },

  getCurrentUser: (): User | null => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem(STORAGE_KEY);
  }
};
