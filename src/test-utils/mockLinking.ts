export const createURL = (path: string, _options?: any): string => {
  return `ascend://${path.replace(/^\//, '')}`;
};

export const openURL = async (_url: string): Promise<boolean> => {
  return true;
};

export const canOpenURL = async (_url: string): Promise<boolean> => {
  return true;
};

export const getInitialURL = async (): Promise<string | null> => {
  return null;
};

export const addEventListener = (_type: string, _handler: (event: { url: string }) => void) => {
  return { remove: () => {} };
};

export const parse = (url: string) => {
  try {
    const normalized = url.startsWith('ascend://')
      ? url.replace('ascend://', 'http://ascend.local/')
      : url;
    const parsed = new URL(normalized);
    const queryParams: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    return {
      scheme: 'ascend',
      hostname: parsed.hostname,
      path: parsed.pathname.replace(/^\//, ''),
      queryParams,
    };
  } catch {
    return {
      scheme: 'ascend',
      hostname: '',
      path: '',
      queryParams: {},
    };
  }
};

export default {
  createURL,
  openURL,
  canOpenURL,
  getInitialURL,
  addEventListener,
  parse,
};
