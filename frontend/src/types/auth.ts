export type User = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};
