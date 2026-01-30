import { useTargetNetwork } from "~~/hooks/scaffold-eth/useTargetNetwork";

/**
 * Hook to get the native currency symbol for the current target network
 * Returns "KITE" for Kite Testnet, "ETH" for Ethereum networks, etc.
 */
export const useNativeCurrency = () => {
  const { targetNetwork } = useTargetNetwork();

  return {
    symbol: targetNetwork.nativeCurrency?.symbol || "ETH",
    name: targetNetwork.nativeCurrency?.name || "Ether",
    decimals: targetNetwork.nativeCurrency?.decimals || 18,
  };
};
