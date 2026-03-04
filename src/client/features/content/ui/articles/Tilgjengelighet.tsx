import { Heading, VStack, Page } from "@navikt/ds-react";
import { KontaktSeksjon } from "../../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx";
import { PageHeader } from "../../../../shared/ui/theme/PageHeader/PageHeader.tsx";

function Accessibility() {
    return (
        <>
            <PageHeader
                title="Tilgjengelighetserklæring"
                description="Innblikk skal være tilgjengelig for alle."
                variant="article"
            />

            <Page.Block width="xl" gutters className="pb-16 px-4">
                <div className="max-w-[800px] mx-auto pt-16">
                    <div className="prose max-w-full prose-lg">
                        <VStack gap="space-12">
                            <section>
                                <p className="mb-4 leading-normal">Innblikk skal være tilgjengelig for alle. Det betyr at vi har som mål å følge lovpålagte krav til universell utforming. Vår ambisjon er i tillegg at du skal ha en god brukeropplevelse enten du bruker hjelpeteknologi (for eksempel skjermleser) eller ikke.</p>
                                <p className="mb-4 leading-normal">Alle virksomheter i offentlig sektor skal ha en tilgjengelighetserklæring. WCAG 2.1 på nivå AA er lovpålagt i Norge. Erklæringen beskriver hvert suksesskriterium i WCAG, og om nettstedet imøtekommer disse kravene.</p>
                            </section>

                            <section className="pt-12">
                                <Heading level="2" size="medium" spacing>
                                    Feil, mangler og forbedringsforslag
                                </Heading>
                                <p className="leading-normal">Hvis du opplever problemer eller har forslag til forbedringer hører vi veldig gjerne fra deg! Feil og mangler kan rapporteres til <a className="underline" href="mailto:eilif.johansen@nav.no">eilif.johansen@nav.no</a>, eller <a className="underline" href="https://nav-it.slack.com/archives/C02UGFS2J4B">#researchops</a> på Slack.</p>
                            </section>
                        </VStack>
                    </div>
                </div>
            </Page.Block>
            <KontaktSeksjon showMarginBottom={true} narrowContent />
        </>
    )
}

export default Accessibility