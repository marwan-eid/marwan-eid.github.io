// Single source of truth for personal data. The home page, /about, /resume
// and the Open Graph images all read from here.

export const profile = {
  name: 'Marwan Eid',
  role: 'Software Engineer',
  headline: 'Backend & full-stack engineer building real-time, event-driven systems.',
  location: 'Giza, Egypt',
  timezone: 'Africa/Cairo',
  email: 'marwan.eid1999@gmail.com',
  site: 'https://marwan-eid.github.io',
  links: {
    github: 'https://github.com/marwan-eid',
    linkedin: 'https://www.linkedin.com/in/marwan-eid',
    milkrunDemo: 'https://marwan-milkrun.duckdns.org/',
    paper: 'https://arxiv.org/abs/2312.10854',
  },
  summary:
    'Software engineer at Valeo, where I design the cloud platform behind real-time vehicle communication. I work across the stack, from event-driven services on AWS and Kubernetes to React frontends, and I care most about systems that stay fast and correct under real-world load.',
} as const;

export const impact = [
  { value: '10 s → 1 s', label: 'API latency', detail: 'Rewrote cold-start-bound Java Lambdas in Go' },
  { value: 'hours → <10 min', label: 'Deploy time', detail: 'GitHub Actions, Docker, Helm, zero-downtime rollouts' },
  { value: '75k+ LOC', label: 'Legacy migration', detail: 'C# desktop app moved to the web, incrementally' },
  { value: '2+ years', label: 'In production', detail: 'Serving hundreds of internal users' },
] as const;

export type Role = {
  title: string;
  company: string;
  start: string;
  end: string;
  bullets: string[];
};

export const experience: Role[] = [
  {
    title: 'Software Engineer',
    company: 'Valeo',
    start: 'Jul 2023',
    end: 'Present',
    bullets: [
      'Designed an event-driven, MQTT-based vehicle communication platform on AWS (EKS, Lambda) for multi-party real-time streaming sessions, placing each session on the least-loaded streaming server and routing device joins through an RDS-backed session registry. Led 2 engineers across system design and delivery.',
      'Automated CI/CD pipelines with GitHub Actions, Docker and Helm on Kubernetes, cutting deployment time from hours to under 10 minutes with zero-downtime rollouts and automated rollbacks.',
      'Built an event-driven, closed-loop AI system that detects operational anomalies in CloudWatch logs, generates candidate fixes, and verifies each fix in sandboxed local and demo environments before routing it to engineers for review.',
      'Cut API response latency from 10 s to 1 s by rewriting cold-start-bound Java Lambda functions in Go.',
    ],
  },
  {
    title: 'Junior Software Engineer',
    company: 'Valeo',
    start: 'Jul 2022',
    end: 'Jul 2023',
    bullets: [
      'Incrementally migrated a 75k+ LOC legacy C# desktop application for vehicle lifecycle management (VW, Volvo, HKM) to the web, extracting modular ASP.NET MVC APIs behind a new React frontend. In production for 2+ years, serving hundreds of internal users.',
      'Built a real-time diagnostics application in C# with an extensible, configuration-driven architecture supporting per-client specifications.',
    ],
  },
];

export const education = {
  degree: 'B.Sc. in Computer Engineering',
  school: 'The American University in Cairo (AUC)',
  start: 'Aug 2017',
  end: 'Jun 2022',
  notes: ['Minors in Mathematics and Economics', 'Cum Laude (Honors)'],
};

export const honors = [
  {
    title: 'Atef & Fofa Eltoukhy Family Endowed Scholarship',
    detail: '$125K scholarship at AUC, awarded to one student every five years for academic achievement, leadership and community service.',
  },
  {
    title: 'Mediterranean Youth Mathematical Championship',
    detail: 'Represented Egypt in Rome (2017) and won a bronze medal, qualifying through the Egyptian Mathematical Olympiad.',
  },
  {
    title: 'The Right Losses for the Right Gains (arXiv:2312.10854)',
    detail: 'Co-authored paper on a text-to-image architecture that outperformed state-of-the-art baselines, improving FID by 44%.',
  },
];

export const skills: { group: string; items: string[] }[] = [
  { group: 'Languages', items: ['Java', 'Go', 'C#', 'Python', 'TypeScript', 'JavaScript', 'C++'] },
  {
    group: 'Backend & APIs',
    items: ['Spring Boot', 'WebFlux', 'ASP.NET (MVC, Core)', 'Node.js', 'Ruby on Rails', 'Apache Kafka', 'MQTT', 'Protobuf', 'REST'],
  },
  {
    group: 'Cloud & DevOps',
    items: ['AWS (EKS, Lambda, RDS, DynamoDB, SQS)', 'Docker', 'Kubernetes (Helm)', 'Terraform', 'GitHub Actions', 'Jenkins'],
  },
  {
    group: 'Data',
    items: ['PostgreSQL / PostGIS', 'MySQL', 'MongoDB', 'Redis (ElastiCache)', 'Elasticsearch', 'Apache Calcite'],
  },
  { group: 'Frontend', items: ['React', 'TypeScript', 'Next.js', 'Redux', 'Leaflet'] },
  { group: 'Observability & Testing', items: ['Prometheus', 'Grafana', 'Micrometer', 'JUnit', 'Vitest', 'JMeter'] },
];
