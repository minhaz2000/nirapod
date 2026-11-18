import { useTranslations } from 'next-intl';
import Icon, { ICON_PATHS, type IconName } from '@/components/Icon';
import { AI_FACTS } from '@/lib/about';

const STEPS: Array<{ key: string; icon: IconName; fill: string; stroke: string }> = [
  { key: 'input', icon: 'camera', fill: '#f1f5f9', stroke: '#334155' },
  { key: 'device', icon: 'lock', fill: '#ccfbf1', stroke: '#115e59' },
  { key: 'verified', icon: 'check', fill: '#dbeafe', stroke: '#1e40af' },
  { key: 'llm', icon: 'info', fill: '#ede9fe', stroke: '#5b21b6' },
  { key: 'result', icon: 'drop', fill: '#dcfce7', stroke: '#166534' },
];

const W = 320;
const BOX_H = 74;
const GAP = 26;

/** "How Nirapod's AI works": a vertical flow diagram (inline SVG, readable at 360 px) and three cards. */
export default function HowAiWorks() {
  const t = useTranslations('about.ai');
  const height = STEPS.length * BOX_H + (STEPS.length - 1) * GAP + 4;
  const card = 'space-y-2 rounded-2xl bg-white p-4 shadow-sm';
  const item = (icon: IconName, text: string, testId?: string) => (
    <li className="flex items-start gap-2" data-testid={testId}>
      <Icon name={icon} size={18} className="mt-0.5 text-teal-800" />
      <span>{text}</span>
    </li>
  );

  return (
    <section className="space-y-4" aria-labelledby="ai-title" data-testid="how-ai-works">
      <h2 id="ai-title" className="text-xl font-bold">
        {t('title')}
      </h2>
      <p>{t('intro')}</p>

      <svg viewBox={`0 0 ${W} ${height}`} className="h-auto w-full" role="img" aria-labelledby="ai-diagram-title" data-testid="ai-diagram">
        <title id="ai-diagram-title">{t('diagram')}</title>
        <defs>
          <marker id="ai-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#475569" />
          </marker>
        </defs>
        {STEPS.map((s, i) => {
          const y = 2 + i * (BOX_H + GAP);
          return (
            <g key={s.key} data-step={s.key}>
              <rect x="2" y={y} width={W - 4} height={BOX_H} rx="14" fill={s.fill} stroke={s.stroke} strokeWidth="2" />
              <circle cx="34" cy={y + BOX_H / 2} r="20" fill="#fff" stroke={s.stroke} strokeWidth="2" />
              <g transform={`translate(22 ${y + BOX_H / 2 - 12})`} fill="none" stroke={s.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d={ICON_PATHS[s.icon]} />
              </g>
              <text x="64" y={y + 26} fontSize="15" fontWeight="700" fill="#0f172a">
                {t(`steps.${s.key}.title`)}
              </text>
              <text x="64" y={y + 46} fontSize="13" fill="#334155">
                {t(`steps.${s.key}.line1`)}
              </text>
              <text x="64" y={y + 63} fontSize="13" fill="#334155">
                {t(`steps.${s.key}.line2`)}
              </text>
              {i < STEPS.length - 1 && (
                <line x1={W / 2} x2={W / 2} y1={y + BOX_H + 2} y2={y + BOX_H + GAP - 4} stroke="#475569" strokeWidth="2" markerEnd="url(#ai-arrow)" />
              )}
            </g>
          );
        })}
      </svg>

      <div className={card} data-testid="ai-models">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="chart" size={22} />
          {t('modelsTitle')}
        </h3>
        <ul className="space-y-2">
          {item('plate', t('models.food', { classes: AI_FACTS.foodClasses }))}
          {item('check', t('models.accuracy', { map: AI_FACTS.foodMaskMap50 }), 'ai-accuracy')}
          {item('clock', t('models.speed', { seconds: AI_FACTS.foodSecondsOnPhone }))}
          {item('pill', t('models.medicines', { products: AI_FACTS.medicineProducts }), 'ai-medicines')}
          {item('drop', t('models.learning'))}
          {item('skin', t('models.skin'))}
        </ul>
      </div>

      <div className={card} data-testid="ai-scale">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="star" size={22} />
          {t('scaleTitle')}
        </h3>
        <ul className="space-y-2">
          {item('users', t('scale.bangla'))}
          {item('phone', t('scale.phones'))}
          {item('settings', t('scale.retrain'))}
        </ul>
      </div>

      <div className={card} data-testid="ai-safety">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Icon name="lock" size={22} />
          {t('safetyTitle')}
        </h3>
        <ul className="space-y-2">
          {item('info', t('safety.guide'))}
          {item('pill', t('safety.medicine'))}
          {item('camera', t('safety.photos'))}
          {item('phone', t('safety.emergency'))}
        </ul>
      </div>
    </section>
  );
}
