import * as react from 'react';
import { ReactNode } from 'react';
import { Q as QuadOptions } from './types-BPIuT2P4.js';

type QuadProviderProps = QuadOptions & {
    children: ReactNode;
};
declare function QuadProvider({ children, ...opts }: QuadProviderProps): react.JSX.Element;

export { QuadProvider, type QuadProviderProps };
