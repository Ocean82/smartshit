/**
 * Conservative, shared mutation veto. A router matching a command fragment is
 * not authorization to edit: explanation, negation and hypothetical requests
 * must remain read-only, even when a downstream classifier disagrees.
 * This is a safety floor, not a general-purpose intent classifier.
 */
export function isNonMutatingRequest(message: string): boolean {
  const text = message.trim().replace(/^please\s+/i, '').replace(/[’‘]/g, "'")
  if (/^(?:do\s+not\b|don't\b|never\b|avoid\b)/i.test(text)) return true
  if (/^(?:explain\b|describe\b|tell\s+me\s+(?:how|why|what)\b|show\s+me\s+how\b|what\s+(?:if|happens|would|does)\b|how\s+(?:do|can|should|would)\b|why\b|suppose\b|imagine\b)/i.test(text)) return true
  // Reject mixed requests too ("sort, but don't delete anything"). Asking for
  // a simpler explicit command is safer than applying half of a request.
  if (/\b(?:do\s+not|don't|never|without|avoid|not\s+to)\s+(?:(?:ever|actually|automatically|please)\s+)?(?:set(?:ting)?|chang(?:e|ing)|edit(?:ing)?|modif(?:y|ying)|delet(?:e|ing)|remov(?:e|ing)|clear(?:ing)?|wip(?:e|ing)|reset(?:ting)?|overwrit(?:e|ing)|replac(?:e|ing)|add(?:ing)?|insert(?:ing)?|creat(?:e|ing)|build(?:ing)?|sort(?:ing)?|format(?:ting)?|bold(?:ing)?|italiciz(?:e|ing)|underlin(?:e|ing)|highlight(?:ing)?|colou?r(?:ing)?|filter(?:ing)?|renam(?:e|ing)|merg(?:e|ing)|fill(?:ing)?|mak(?:e|ing)|apply(?:ing)?|run(?:ning)?|execut(?:e|ing))\b/i.test(text)) return true
  // Quoted command fragments are data to explain or discuss, not instructions.
  return /^["'`][\s\S]*["'`]\s*[.!?]?$/.test(text)
}
