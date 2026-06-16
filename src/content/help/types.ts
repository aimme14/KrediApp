export type HelpFaq = {
  q: string;
  a: string;
};

export type HelpLink = {
  label: string;
  href: string;
};

export type HelpPageContent = {
  title: string;
  summary: string;
  steps?: string[];
  cautions?: string[];
  faqs?: HelpFaq[];
  relatedLinks?: HelpLink[];
};

export type HelpRoleGeneral = {
  title: string;
  intro: string;
  dailyFlow: string[];
  faqs: HelpFaq[];
};
