"use client";

import { useCallback, useState, useTransition } from "react";
import {
  selectPlan,
  presentContract,
  getContractSigningUrl,
  initiatePayment,
  markWarrantyViewed,
} from "./actions";

export type WarrantyStep =
  | "offer"
  | "selecting"
  | "contract"
  | "signing"
  | "payment"
  | "receipt";

/** Hook for driving the warranty flow UI across all steps */
export function useWarrantyFlow(warrantyOptionId: string) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleSelectPlan = useCallback(async (planIndex: number): Promise<string | null> => {
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await selectPlan(warrantyOptionId, planIndex);
        if ("error" in result) {
          setError(result.error);
          resolve(null);
        } else {
          resolve(result.orderId);
        }
      });
    });
  }, [startTransition, warrantyOptionId]);

  const handlePresentContract = useCallback(async (orderId: string): Promise<string | null> => {
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await presentContract(orderId);
        if ("error" in result) {
          setError(result.error);
          resolve(null);
        } else {
          resolve(result.contractId);
        }
      });
    });
  }, [startTransition]);

  const handleGetSigningUrl = useCallback(async (contractId: string): Promise<string | null> => {
    setError(null);
    const result = await getContractSigningUrl(contractId);
    if ("error" in result) {
      // In dev fallback mode contracts can be auto-signed immediately.
      // Treat this as a successful signed state transition.
      if (result.error === "Already signed") {
        return "__SIGNED_ALREADY__";
      }
      setError(result.error);
      return null;
    }
    return result.embedSrc;
  }, []);

  const handleInitiatePayment = useCallback(async (contractId: string): Promise<string | null> => {
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const result = await initiatePayment(contractId);
        if ("error" in result) {
          setError(result.error);
          resolve(null);
        } else {
          resolve(result.checkoutUrl);
        }
      });
    });
  }, [startTransition]);

  const handleMarkViewed = useCallback(async () => {
    await markWarrantyViewed(warrantyOptionId);
  }, [warrantyOptionId]);

  return {
    isPending,
    error,
    clearError,
    handleSelectPlan,
    handlePresentContract,
    handleGetSigningUrl,
    handleInitiatePayment,
    handleMarkViewed,
  };
}
