import { Inngest } from "inngest";

/** Same app id as the Next.js serve endpoint — functions merge in one Inngest app. */
export const inngest = new Inngest({ id: "tejacodereview" });
