/**
 * NEEDS PHARMACIST REVIEW — allergy groups. If a user lists one of these names (or an alias) as an allergy,
 * every ingredient in the group is flagged. Short and incomplete on purpose; cross-reactions between groups
 * (e.g. penicillin → cephalosporin) are not covered.
 */
import { NSAIDS } from './interactions';

export interface AllergyGroup {
  id: string;
  aliases: readonly string[];
  ingredients: readonly string[];
}

export const ALLERGY_GROUPS: readonly AllergyGroup[] = [
  {
    id: 'penicillin',
    aliases: ['penicillin', 'penicillins', 'পেনিসিলিন'],
    ingredients: ['penicillin', 'amoxicillin', 'ampicillin', 'flucloxacillin', 'cloxacillin', 'piperacillin', 'phenoxymethylpenicillin', 'benzylpenicillin'],
  },
  {
    id: 'cephalosporin',
    aliases: ['cephalosporin', 'cephalosporins', 'সেফালোস্পোরিন'],
    ingredients: ['cefixime', 'cefuroxime', 'ceftriaxone', 'cephradine', 'cefaclor', 'cefpodoxime', 'cefadroxil', 'cefepime', 'ceftazidime', 'cephalexin'],
  },
  {
    id: 'sulfa',
    aliases: ['sulfa', 'sulpha', 'sulfonamide', 'sulphonamide', 'সালফা'],
    ingredients: ['sulfamethoxazole', 'sulfasalazine', 'sulfadiazine', 'cotrimoxazole'],
  },
  { id: 'nsaid', aliases: ['nsaid', 'nsaids', 'painkiller nsaid'], ingredients: [...NSAIDS, 'aspirin'] },
  { id: 'aspirin', aliases: ['aspirin', 'অ্যাসপিরিন'], ingredients: ['aspirin', 'acetylsalicylic acid'] },
];
