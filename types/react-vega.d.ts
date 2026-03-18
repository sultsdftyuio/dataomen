// types/react-vega.d.ts

declare module 'react-vega' {
  import * as React from 'react';
  
  export interface VegaLiteProps {
    spec: any;
    data?: any;
    actions?: boolean | any;
    width?: number | string;
    height?: number | string;
    onNewView?: (view: any) => void;
    className?: string;
    style?: React.CSSProperties;
    config?: any; 
  }
  
  export const VegaLite: React.FC<VegaLiteProps>;
  export const Vega: React.FC<any>;
}