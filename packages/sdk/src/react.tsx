/**
 * React adapter for @quad/sdk. Marked "use client" so a host App Router
 * layout (which is a server component by default) can import it directly.
 * The widget's DOM only mounts inside the useEffect — never on the server.
 */
"use client";

import { useEffect, type ReactNode } from "react";
import { quad, type QuadOptions } from "./index";

export type QuadProviderProps = QuadOptions & {
  children: ReactNode;
};

export function QuadProvider({ children, ...opts }: QuadProviderProps) {
  useEffect(() => {
    quad.init(opts);
    return () => quad.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <>{children}</>;
}
