export interface SpectralRange {
  name: string;
  min: number;
  max: number;
  assignment: string;
  description: string;
  category: 'Organic' | 'Polymer' | 'Nanomaterial' | 'Carbon';
}

export interface UniversalSpectralLibrary {
  FTIR: SpectralRange[];
  RAMAN: SpectralRange[];
}

export const UNIVERSAL_SPECTRAL_LIBRARY: UniversalSpectralLibrary = {
  FTIR: [
    {
      name: 'O-H stretching',
      min: 3200,
      max: 3600,
      assignment: 'O-H stretching (hydrogen bonding)',
      description: 'Broad absorption band corresponding to hydrogen-bonded hydroxyl groups, common in polymers, water, and surface hydroxyls.',
      category: 'Organic'
    },
    {
      name: 'COO- asymmetric stretching',
      min: 1590,
      max: 1620,
      assignment: 'COO- asymmetric stretching (carboxylate)',
      description: 'Confirms the presence of carboxylate groups, typically used to verify carboxymethyl cellulose (CMC) structures and modification.',
      category: 'Polymer'
    },
    {
      name: 'C-O-C skeletal vibration',
      min: 1000,
      max: 1100,
      assignment: 'C-O-C skeletal vibration',
      description: 'Skeletal ether linkage stretching, characteristic of sugar rings and cellulose/sugar backbone structures.',
      category: 'Polymer'
    },
    {
      name: 'Metal-Oxygen (Tetrahedral)',
      min: 550,
      max: 620,
      assignment: 'Metal-Oxygen stretching (Tetrahedral site)',
      description: 'Intrinsic stretching vibration of metal-oxygen bonds in tetrahedral coordination sites, characteristic of spinel ferrite structure.',
      category: 'Nanomaterial'
    },
    {
      name: 'Metal-Oxygen (Octahedral)',
      min: 380,
      max: 450,
      assignment: 'Metal-Oxygen stretching (Octahedral site)',
      description: 'Intrinsic stretching vibration of metal-oxygen bonds in octahedral coordination sites, characteristic of spinel ferrite structure.',
      category: 'Nanomaterial'
    }
  ],
  RAMAN: [
    {
      name: 'D-band',
      min: 1300,
      max: 1400,
      assignment: 'D-band (carbon defect mode)',
      description: 'Disorder-induced breathing mode of aromatic rings, indicating defects or amorphous carbonaceous residue in carbon/graphene.',
      category: 'Carbon'
    },
    {
      name: 'G-band',
      min: 1550,
      max: 1610,
      assignment: 'G-band (graphitic carbon)',
      description: 'In-plane stretching mode of sp2-bonded carbon atoms, confirming graphite-like crystalline carbon structures.',
      category: 'Carbon'
    },
    {
      name: 'A1g symmetric stretching',
      min: 650,
      max: 720,
      assignment: 'A1g symmetric stretching (ferrite group)',
      description: 'Symmetric stretching of metal-oxygen bonds in the tetrahedral sublattice of spinel ferrites (e.g. CoFe2O4).',
      category: 'Nanomaterial'
    }
  ]
};
