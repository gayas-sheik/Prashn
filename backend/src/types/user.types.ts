export interface User {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPayload {
  userId: string;
  email: string;
  role: string;
}
