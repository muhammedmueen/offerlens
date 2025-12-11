import React, { createContext, useContext, useState, ReactNode } from "react";

export interface OfferData {
  offerText: string;
  role: string;
  experience: string;
  ctc: number;
  fileName?: string;
}

interface OfferContextType {
  offerData: OfferData | null;
  setOfferData: (data: OfferData) => void;
  clearOfferData: () => void;
}

const OfferContext = createContext<OfferContextType | undefined>(undefined);

export function OfferProvider({ children }: { children: ReactNode }) {
  const [offerData, setOfferDataState] = useState<OfferData | null>(null);

  const setOfferData = (data: OfferData) => {
    setOfferDataState(data);
  };

  const clearOfferData = () => {
    setOfferDataState(null);
  };

  return (
    <OfferContext.Provider value={{ offerData, setOfferData, clearOfferData }}>
      {children}
    </OfferContext.Provider>
  );
}

export function useOffer() {
  const context = useContext(OfferContext);
  if (context === undefined) {
    throw new Error("useOffer must be used within an OfferProvider");
  }
  return context;
}
