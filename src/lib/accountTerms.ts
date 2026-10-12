import { supabase } from "./supabase";

export interface TermsDocument { id: string; title: string; content: string; version: string }
export interface TermsAcceptance { user_id: string; terms_document_id: string; accepted_at: string }
export interface AccountTerms { document: TermsDocument | null; acceptance: TermsAcceptance | null }

export function termsAcceptance(value: unknown, userId: string): TermsAcceptance | null {
  if (!value || typeof value !== "object") return null;
  const receipt = value as TermsAcceptance;
  return receipt.user_id === userId && typeof receipt.terms_document_id === "string" && receipt.terms_document_id.length > 0 && typeof receipt.accepted_at === "string" && Number.isFinite(Date.parse(receipt.accepted_at)) ? receipt : null;
}
export async function readAccountTerms(userId: string): Promise<AccountTerms> {
  const { data, error } = await supabase.rpc("get_account_terms");
  if (error) throw new Error("Unable to check Terms and Conditions. Check your connection and retry.");
  if (!data || typeof data !== "object" || !("document" in data) || !("acceptance" in data)) throw new Error("Unable to load the approved Terms and Conditions. Please retry.");
  const acceptance = termsAcceptance(data.acceptance, userId);
  if (data.acceptance && !acceptance) throw new Error("Unable to verify your terms acceptance. Please sign in again.");
  const document = data.document as TermsDocument | null;
  if (document && (![document.id, document.title, document.content, document.version].every(value => typeof value === "string" && value.trim().length > 0))) throw new Error("Approved Terms and Conditions content is incomplete. Contact the barangay office.");
  return { document, acceptance };
}
export async function acceptAccountTerms(documentId: string, userId: string): Promise<TermsAcceptance> {
  const { data, error } = await supabase.rpc("accept_account_terms", { p_document_id: documentId, p_agreed: true });
  if (error) throw new Error(error.message || "Unable to save your acceptance. Please retry.");
  const receipt = termsAcceptance(data, userId);
  if (!receipt) throw new Error("Your acceptance could not be confirmed. Please retry.");
  return receipt;
}
