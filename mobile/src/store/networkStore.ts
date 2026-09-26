import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { create } from "zustand";

interface NetworkState {
  isOnline: boolean;
  /** False until the first NetInfo event, so we don't flash "offline". */
  known: boolean;
  setFromNetInfo: (state: NetInfoState) => void;
}

export const isOnlineState = (s: Pick<NetInfoState, "isConnected" | "isInternetReachable">) =>
  !!s.isConnected && s.isInternetReachable !== false;

export const useNetworkStore = create<NetworkState>((set) => ({
  isOnline: true,
  known: false,
  setFromNetInfo: (state) => set({ isOnline: isOnlineState(state), known: true }),
}));

/** Subscribe once at app start. Returns the unsubscribe function. */
export function startNetworkListener(onReconnect?: () => void): () => void {
  let wasOnline = useNetworkStore.getState().isOnline;
  return NetInfo.addEventListener((state) => {
    useNetworkStore.getState().setFromNetInfo(state);
    const online = isOnlineState(state);
    if (online && !wasOnline) onReconnect?.();
    wasOnline = online;
  });
}
