import { useState, useCallback, useRef } from "react";
import { useWalletClient } from "wagmi";

/**
 * Custom hook for the iExec Nox Handle Client.
 *
 * Provides methods to encrypt values and decrypt handles using the
 * @iexec-nox/handle SDK with the connected wallet.
 *
 * Key behaviour:
 *  - Public handles (chainId=0) are created by Nox.toEuint256(0) on-chain.
 *    These represent a plaintext zero and cannot be "decrypted" through the SDK.
 *    We detect them and return 0n immediately without calling the SDK.
 *  - Uninitialized handles (bytes32(0)) are also short-circuited to 0n.
 */
export function useNoxSDK() {
  const { data: walletClient } = useWalletClient();
  const [isReady, setIsReady] = useState(false);
  const clientRef = useRef<any>(null);

  /**
   * Lazily initialize the handle client when first needed.
   */
  const getClient = useCallback(async () => {
    if (clientRef.current) return clientRef.current;

    if (!walletClient) {
      throw new Error("Wallet not connected. Connect your wallet first.");
    }

    // Dynamic import to avoid bundling issues
    const { createViemHandleClient } = await import("@iexec-nox/handle");
    const handleClient = await createViemHandleClient(walletClient);
    clientRef.current = handleClient;
    setIsReady(true);
    return handleClient;
  }, [walletClient]);

  /**
   * Check if a handle is a zero/uninitialized handle (bytes32(0)).
   * These are produced when the user has no balance yet.
   */
  const isZeroHandle = (handle: `0x${string}`): boolean => {
    // A zero handle is 0x followed by 64 zero hex chars
    return /^0x0{64}$/.test(handle);
  };

  /**
   * Check if an error is the "chainId mismatch" error from Nox SDK.
   * This happens when the handle is a public handle (chainId=0 in metadata).
   * Public handles represent plaintext values (like toEuint256(0)) and always
   * have chainId=0 encoded, which mismatches the connected chain.
   */
  const isPublicHandleError = (e: any): boolean => {
    const msg = e?.message || e?.toString() || "";
    return (
      msg.includes("chainId (0)") ||
      msg.includes("Handle chainId") ||
      msg.includes("does not match connected chainId") ||
      msg.includes("public handle")
    );
  };

  /**
   * Encrypt a uint256 value for use with a specific contract.
   *
   * @param value - The plaintext bigint value to encrypt
   * @param contractAddress - The contract that will use this encrypted handle
   * @returns { handle, handleProof } - The encrypted handle and its proof
   */
  const encryptAmount = useCallback(
    async (value: bigint, contractAddress: string) => {
      const client = await getClient();
      const result = await client.encryptInput(value, "uint256", contractAddress);
      return {
        handle: result.handle as `0x${string}`,
        handleProof: result.handleProof as `0x${string}`,
      };
    },
    [getClient]
  );

  /**
   * Encrypt a boolean value for use with a specific contract.
   *
   * @param value - The plaintext boolean to encrypt
   * @param contractAddress - The contract that will use this encrypted handle
   * @returns { handle, handleProof }
   */
  const encryptBool = useCallback(
    async (value: boolean, contractAddress: string) => {
      const client = await getClient();
      const result = await client.encryptInput(value, "bool", contractAddress);
      return {
        handle: result.handle as `0x${string}`,
        handleProof: result.handleProof as `0x${string}`,
      };
    },
    [getClient]
  );

  /**
   * Decrypt an encrypted handle. The connected wallet must be authorized
   * on the handle's ACL. This is gasless (uses EIP-712 signature).
   *
   * Handles two special cases without calling the SDK:
   *  1. Zero handle (bytes32(0)) → returns 0n immediately
   *  2. Public handle (chainId=0 error) → returns 0n immediately
   *     This happens for Nox.toEuint256(0) public handles.
   *
   * @param handle - The 32-byte handle to decrypt
   * @returns { value, solidityType } - The decrypted value and its type
   */
  const decryptHandle = useCallback(
    async (handle: `0x${string}`) => {
      // Fast path: zero handle = no balance, skip SDK call
      if (isZeroHandle(handle)) {
        return { value: 0n, solidityType: "uint256" };
      }

      try {
        const client = await getClient();
        const result = await client.decrypt(handle);
        return {
          value: result.value as bigint,
          solidityType: result.solidityType as string,
        };
      } catch (e: any) {
        // Public handles (chainId=0) represent plaintext 0.
        // They cannot be "decrypted" via the SDK because they have no chain binding.
        // Nox emits them for Nox.toEuint256(0) — meaning "this handle is zero".
        if (isPublicHandleError(e)) {
          return { value: 0n, solidityType: "uint256" };
        }
        throw e;
      }
    },
    [getClient]
  );

  // Reset client when wallet changes
  const resetClient = useCallback(() => {
    clientRef.current = null;
    setIsReady(false);
  }, []);

  return {
    encryptAmount,
    encryptBool,
    decryptHandle,
    isReady,
    resetClient,
  };
}
