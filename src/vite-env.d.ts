/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DESK_ENV?: string;
  /** mock | broker — lock Orders/PnL to one book (no toggle). */
  readonly VITE_DESK_PROFILE?: string;
  readonly VITE_DEFAULT_BROKER?: string;
  /** When VITE_DESK_PROFILE=broker, label for the book chip (default Live). */
  readonly VITE_BROKER_BOOK_LABEL?: string;
  /** Public URL subpath for production (e.g. /pnl). Vite `base` + Router basename. Default /. */
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
