export interface MilestoneSuggestion {
  description: string;
  amount: string;
}

export const mockSplitMilestones = async (description: string): Promise<MilestoneSuggestion[]> => {
  // Simulate AI processing delay
  await new Promise(r => setTimeout(r, 1500));

  const lowerDesc = description.toLowerCase();

  if (lowerDesc.includes('website') || lowerDesc.includes('web')) {
    return [
      { description: 'Design mockups and wireframes', amount: '0.5' },
      { description: 'Frontend development', amount: '1.0' },
      { description: 'Testing and deployment', amount: '0.5' },
    ];
  }

  if (lowerDesc.includes('mobile') || lowerDesc.includes('app')) {
    return [
      { description: 'UI/UX design and prototyping', amount: '0.4' },
      { description: 'Core functionality implementation', amount: '0.8' },
      { description: 'API integration', amount: '0.5' },
      { description: 'Testing and App Store submission', amount: '0.3' },
    ];
  }

  if (lowerDesc.includes('smart contract') || lowerDesc.includes('blockchain') || lowerDesc.includes('solidity')) {
    return [
      { description: 'Contract architecture and design', amount: '0.3' },
      { description: 'Smart contract development', amount: '0.6' },
      { description: 'Security audit and testing', amount: '0.4' },
      { description: 'Deployment and documentation', amount: '0.2' },
    ];
  }

  if (lowerDesc.includes('logo') || lowerDesc.includes('brand') || lowerDesc.includes('design')) {
    return [
      { description: 'Concept exploration and moodboard', amount: '0.2' },
      { description: 'Initial design drafts', amount: '0.4' },
      { description: 'Revisions and final delivery', amount: '0.2' },
    ];
  }

  if (lowerDesc.includes('portfolio')) {
    return [
      { description: 'Design mockups', amount: '0.5' },
      { description: 'Frontend development', amount: '1.0' },
      { description: 'Testing and deployment', amount: '0.5' },
    ];
  }

  // Default response for any other project
  return [
    { description: 'Phase 1: Planning and requirements', amount: '0.3' },
    { description: 'Phase 2: Implementation', amount: '0.5' },
    { description: 'Phase 3: Review and delivery', amount: '0.2' },
  ];
};
