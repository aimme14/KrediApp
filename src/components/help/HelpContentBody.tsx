import Link from "next/link";
import type { HelpPageContent, HelpRoleGeneral } from "@/content/help/types";

type HelpContentBodyProps = {
  content: HelpPageContent;
  showRelatedLinks?: boolean;
};

export function HelpContentBody({ content, showRelatedLinks = true }: HelpContentBodyProps) {
  return (
    <div className="help-content-body">
      <p className="help-content-summary">{content.summary}</p>

      {content.steps && content.steps.length > 0 ? (
        <section className="help-content-section">
          <h4 className="help-content-heading">Pasos recomendados</h4>
          <ol className="help-content-list help-content-list--ordered">
            {content.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ) : null}

      {content.cautions && content.cautions.length > 0 ? (
        <section className="help-content-section help-content-section--caution">
          <h4 className="help-content-heading">Ten en cuenta</h4>
          <ul className="help-content-list">
            {content.cautions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.faqs && content.faqs.length > 0 ? (
        <section className="help-content-section">
          <h4 className="help-content-heading">Preguntas frecuentes</h4>
          <dl className="help-content-faqs">
            {content.faqs.map((faq) => (
              <div key={faq.q} className="help-content-faq">
                <dt>{faq.q}</dt>
                <dd>{faq.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {showRelatedLinks && content.relatedLinks && content.relatedLinks.length > 0 ? (
        <section className="help-content-section">
          <h4 className="help-content-heading">Secciones relacionadas</h4>
          <ul className="help-content-links">
            {content.relatedLinks.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="help-content-link">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

type HelpGeneralBodyProps = {
  general: HelpRoleGeneral;
};

export function HelpGeneralBody({ general }: HelpGeneralBodyProps) {
  return (
    <div className="help-content-body">
      <p className="help-content-summary">{general.intro}</p>

      <section className="help-content-section">
        <h4 className="help-content-heading">Flujo operativo del día</h4>
        <ol className="help-content-list help-content-list--ordered">
          {general.dailyFlow.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="help-content-section">
        <h4 className="help-content-heading">Preguntas frecuentes</h4>
        <dl className="help-content-faqs">
          {general.faqs.map((faq) => (
            <div key={faq.q} className="help-content-faq">
              <dt>{faq.q}</dt>
              <dd>{faq.a}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
