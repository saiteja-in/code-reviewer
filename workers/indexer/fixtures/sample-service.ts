export class UserService {
  find(id: string): string {
    return id;
  }

  delete(id: string): void {
    this.find(id);
  }
}

export interface UserStore {
  save(user: unknown): Promise<void>;
}

export function createUserService(): UserService {
  return new UserService();
}
