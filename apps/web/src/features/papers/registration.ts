export function isRegistrationComplete(dossier: {
  paymentsEnabled: boolean;
  paymentProof: boolean;
  registration: { status: string; paymentStatus: string } | null;
}): boolean {
  if (dossier.registration?.status !== 'VERIFIED') {
    return false;
  }
  if (!dossier.paymentsEnabled) {
    return true;
  }
  return dossier.registration.paymentStatus === 'VERIFIED' && dossier.paymentProof;
}
