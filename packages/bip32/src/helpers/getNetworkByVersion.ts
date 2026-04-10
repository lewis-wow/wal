type VersionRecord = Record<string, { public: number; private: number }>;

export const getNetworkByVersion = <T extends VersionRecord>(
  versions: T,
  version: number,
): [keyof T & string, T[keyof T]] | undefined => {
  const entries = Object.entries(versions) as Array<[keyof T & string, T[keyof T]]>;
  return entries.find(([, versionSet]) => versionSet.public === version || versionSet.private === version);
};
