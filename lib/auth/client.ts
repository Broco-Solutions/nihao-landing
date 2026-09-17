"use client";

import { createAuthClient } from "better-auth/react";
import { authApiUrl } from "@/lib/api/origin";

export const authClient = createAuthClient({
  baseURL: authApiUrl,
  fetchOptions: { credentials: "include" },
});
