import { createUserService } from "./sample-service";

export function handleUser(id: string): string {
  const service = createUserService();
  return service.find(id);
}
