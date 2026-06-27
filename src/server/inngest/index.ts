export { inngest } from "./client";
export { reviewPR } from "./functions/review-pr";
export { registerRepoWebhook } from "./functions/register-repo-webhook";

import { reviewPR } from "./functions/review-pr";
import { registerRepoWebhook } from "./functions/register-repo-webhook";

export const functions = [reviewPR, registerRepoWebhook];
