export const candidateStyleMeta = {
  215: {
    shortName: 'Begich',
    displayName: 'Begich',
    icon: 'begich',
    colors: {
      soft: '#8E63B8',
      dark: '#5E347F',
      tint: '#F1EAF8'
    }
  },
  218: {
    shortName: 'Peltola',
    displayName: 'Peltola',
    icon: 'peltola',
    colors: {
      soft: '#4F7DE2',
      dark: '#2451B8',
      tint: '#EAF1FF'
    }
  },
  217: {
    shortName: 'Palin',
    displayName: 'Palin',
    icon: 'palin',
    colors: {
      soft: '#EF4444',
      dark: '#B91C1C',
      tint: '#FEECEC'
    }
  },
  214: {
    shortName: 'Write-in',
    displayName: 'Write-in',
    icon: 'writein',
    colors: {
      soft: '#F2A900',
      dark: '#B77900',
      tint: '#FFF5D6'
    }
  }
};

export function getCandidateMeta(candidate) {
  const defaults = {
    shortName: candidate?.name ?? 'Candidate',
    displayName: candidate?.name ?? 'Candidate',
    icon: null,
    colors: {
      soft: '#9CA3AF',
      dark: '#4B5563',
      tint: '#F3F4F6'
    }
  };

  return {
    ...defaults,
    ...(candidateStyleMeta[candidate?.id] || {})
  };
}
