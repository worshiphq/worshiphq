"use client";

import { useState } from "react";
import { PasswordStrength } from "@/components/ui/password-strength";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label } from "@/components/ui/input";
import { completePasswordReset } from "@/app/actions/auth";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");

  return (
    <form action={completePasswordReset} className="mt-6 space-y-4">
      <div>
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="••••••••"
          minLength={6}
          required
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
        />
        <PasswordStrength password={password} />
      </div>
      <div>
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          placeholder="••••••••"
          minLength={6}
          required
        />
      </div>
      <SubmitButton size="lg" className="w-full" pendingLabel="Updating password...">
        Reset password
      </SubmitButton>
    </form>
  );
}
