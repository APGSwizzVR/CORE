export {};

declare global {
  interface Window {
    coreDesktop?: {
      isDesktop: true;
      getDisplaySources: () => Promise<Array<{ id: string; name: string; type: 'screen' | 'window'; thumbnail: string; icon: string }>>;
      selectDisplaySource: (sourceId: string) => Promise<boolean>;
      openPrivacySettings: (kind: 'camera' | 'microphone') => Promise<boolean>;
    };
  }
}
