declare module 'electron' {
  export interface BrowserWindowConstructorOptions {
    backgroundColor?: string;
    height?: number;
    minHeight?: number;
    minWidth?: number;
    show?: boolean;
    width?: number;
    webPreferences?: {
      contextIsolation?: boolean;
      nodeIntegration?: boolean;
      preload?: string;
      sandbox?: boolean;
      webSecurity?: boolean;
    };
  }

  export interface OpenDevToolsOptions {
    mode?: 'bottom' | 'detach' | 'right' | 'undocked';
  }

  export interface NavigationEvent {
    preventDefault(): void;
  }

  export interface WebContents {
    on(
      event: 'will-navigate',
      listener: (event: NavigationEvent, url: string) => void,
    ): void;
    openDevTools(options?: OpenDevToolsOptions): void;
    setWindowOpenHandler(
      handler: (details: { url: string }) => { action: 'allow' | 'deny' },
    ): void;
  }

  export class BrowserWindow {
    public static getAllWindows(): BrowserWindow[];

    public readonly webContents: WebContents;

    public constructor(options?: BrowserWindowConstructorOptions);

    public loadFile(filePath: string): Promise<void>;
    public loadURL(url: string): Promise<void>;
    public once(event: 'ready-to-show', listener: () => void): void;
    public show(): void;
  }

  export interface App {
    isPackaged: boolean;

    getPath(name: string): string;
    getVersion(): string;
    on(event: string, listener: (...args: unknown[]) => void): void;
    quit(): void;
    whenReady(): Promise<void>;
  }

  export interface IpcMain {
    handle<TArgs extends unknown[], TResult>(
      channel: string,
      listener: (event: unknown, ...args: TArgs) => TResult | Promise<TResult>,
    ): void;
  }

  export interface IpcRenderer {
    invoke<TResult = unknown>(channel: string, ...args: unknown[]): Promise<TResult>;
  }

  export interface ContextBridge {
    exposeInMainWorld(key: string, api: unknown): void;
  }

  export interface Shell {
    openExternal(url: string): Promise<void>;
  }

  export const app: App;
  export const contextBridge: ContextBridge;
  export const ipcMain: IpcMain;
  export const ipcRenderer: IpcRenderer;
  export const shell: Shell;
}
