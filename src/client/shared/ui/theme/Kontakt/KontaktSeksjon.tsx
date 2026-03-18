import { Heading, Link } from "@navikt/ds-react";
import { AppBlock } from "../AppBlock/AppBlock.tsx";

interface KontaktSeksjonProps {
    showMarginBottom?: boolean;
    narrowContent?: boolean;
}

export const KontaktSeksjon = ({ showMarginBottom = false, narrowContent = false }: KontaktSeksjonProps) => {
    const contentWrapper = narrowContent ? (
        <div className="max-w-[800px] mx-auto">
            <KontaktContent />
        </div>
    ) : (
        <KontaktContent />
    );

    return (
        <div style={{
            width: '100%',
            backgroundColor: 'var(--ax-bg-accent-soft)',
            paddingTop: '60px',
            paddingBottom: '60px',
            marginTop: '60px',
            marginBottom: showMarginBottom ? '-60px' : '0'
        }}>
            <AppBlock>
                {contentWrapper}
            </AppBlock>
        </div>
    );
};

const KontaktContent = () => (
    <>
        <Heading as="h2" size="medium" style={{ marginBottom: '24px' }}>
            Ønsker du noen å sparre med?
        </Heading>

        <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px'
        }}>
            {/* Chat med oss - Slack */}
            <div style={{
                backgroundColor: 'var(--ax-bg-default)',
                padding: '32px',
                borderRadius: '8px',
                border: '1px solid var(--ax-border-neutral-subtle)'
            }}>
                <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B" target="_blank">
                    <Heading as="h2" size="medium" style={{ marginBottom: '12px', color: 'var(--ax-text-accent)' }}>
                        Chat med ResearchOps
                    </Heading>
                </Link>
                <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>
                    Bli med i Slack-kanalen{' '}
                    <Link href="https://nav-it.slack.com/archives/C02UGFS2J4B" target="_blank">
                        #researchops
                    </Link>
                    {' '}for å stille spørsmål og få hjelp.
                </p>
            </div>

            {/* Book en samtale */}
            <div style={{
                backgroundColor: 'var(--ax-bg-default)',
                padding: '32px',
                borderRadius: '8px',
                border: '1px solid var(--ax-border-neutral-subtle)'
            }}>
                <Link href="https://outlook.office365.com/owa/calendar/TeamResearchOps@nav.no/bookings/" target="_blank">
                    <Heading as="h2" size="medium" style={{ marginBottom: '12px', color: 'var(--ax-text-accent)' }}>
                        Du kan også booke en samtale
                    </Heading>
                </Link>
                <p style={{ margin: 0, fontSize: '16px', lineHeight: '1.5' }}>
                    <Link
                        href="https://outlook.office365.com/owa/calendar/TeamResearchOps@nav.no/bookings/"
                        target="_blank"
                    >
                        Book en prat 1:1 eller workshop
                    </Link>
                    {' '}med ResearchOps-teamet.
                </p>
            </div>
        </div>
    </>
);
