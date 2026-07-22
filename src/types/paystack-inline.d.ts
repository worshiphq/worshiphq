declare module "@paystack/inline-js" {
  interface ResumeCallbacks {
    onSuccess?: (transaction: { reference?: string; status?: string }) => void;
    onCancel?: () => void;
    onLoad?: (response: unknown) => void;
    onError?: (error: { message?: string }) => void;
  }
  export default class PaystackPop {
    resumeTransaction(accessCode: string, callbacks?: ResumeCallbacks): unknown;
    newTransaction(options: Record<string, unknown> & ResumeCallbacks): unknown;
  }
}
