import { Heading, Link, VStack, Box, Page } from "@navikt/ds-react";
import { KontaktSeksjon } from "../../../../shared/ui/theme/Kontakt/KontaktSeksjon.tsx";
import { PageHeader } from "../../../../shared/ui/theme/PageHeader/PageHeader.tsx";

function Personvern() {
    return (
        <>
            <PageHeader
                title="Personvern"
                description={<>Slik håndterer vi personvern og sikkerhet på <Link href="https://startumami.ansatt.nav.no" className="underline hover:no-underline">startumami.ansatt.nav.no</Link></>}
                variant="article"
            />

            <Page.Block width="xl" gutters className="pb-16 px-4">
                <div className="max-w-[800px] mx-auto pt-16">
                    <div className="prose max-w-full prose-lg">
                        <VStack gap="space-12">
                            <section>
                                <Heading level="2" size="medium" spacing>
                                    Hva er Innblikk
                                </Heading>
                                <p className="mb-4 leading-normal">
                                    Innblikk er en nettside for Nav Arbeids- og velferdsdirektoratet. Personvernerklæring for behandling av personopplysninger. For mer info: <Link href="https://navno.sharepoint.com/sites/intranett-hr/SitePages/Personvernerkl%C3%A6ring.aspx" className="underline hover:no-underline">ansattes personvern</Link>
                                </p>
                            </section>

                            <section className="pt-16">
                                <Heading level="2" size="medium" spacing>
                                    Formålet med audit loggingen
                                </Heading>
                                <p className="mb-4 leading-normal">
                                    Når du bruker målingsverktøyet Umami så sender Innblikk din Nav-ident sammen med alle spørringer som kjøres. Dette gjør at vi kan logge hvem som har kjørt hvilke spørringer, og er en del av vår sikkerhetsrutine for å beskytte data innsamlet med målingsverktøyet Umami.
                                </p>
                                <p className="mb-4 leading-normal">
                                    Loggene brukes kun til statistikk, avvik og sikkerhetsformål. Eksempelvis i forbindelse med avvik for å se hvem som har gjort hvilke spørringer og har hatt tilgang til eventuelle personopplysninger som er innsamlet ved en feil.
                                </p>
                                <p className="mb-4 leading-normal">
                                    Personopplysningene dine deles ikke med andre aktører, men vil kunne deles med den registrerte dersom denne ber om innsyn etter personopplysningloven.
                                </p>
                                <p className="leading-normal">
                                    Hjemmelen for denne behandlingen er personvernforordningen artikkel 32.
                                </p>
                            </section>

                            <section className="pt-16">
                                <Heading level="2" size="medium" spacing>
                                    Bruk av informasjonskapsler (cookies)
                                </Heading>
                                <p className="mb-4 leading-normal">Når du besøker nettsiden bruker vi informasjonskapsler (cookies).</p>

                                <Box className="my-4 p-6 border border-border-subtle rounded-medium">
                                    <p className="mb-4 leading-normal">Informasjonskapsler er små tekstfiler som plasseres på din datamaskin når du laster ned en nettside. Noen av informasjonskapslene er nødvendige for at ulike tjenester på nettsiden vår skal fungere slik vi ønsker.</p>
                                    <p className="leading-normal">Vi bruker informasjonskapsler til å forbedre brukeropplevelsen og innholdet. Når du besøker aksel.Nav.no, sender nettleseren din opplysninger til Navs analyseverktøy.</p>
                                </Box>

                                <section className="pt-8">
                                    <Heading level="3" size="small" spacing>
                                        skyra*
                                    </Heading>
                                    <p className="mb-4 leading-normal">
                                        Brukes av verktøyet Skyra for å lagre svarene du gir på en undersøkelse. Avhengig av oppsett på undersøkelsen er dette enten en sesjonskapsel eller en kapsel som slettes etter få timer. Kapselen slettes når en undersøkelse fullføres eller lukkes.
                                    </p>
                                </section>

                                <section className="pt-8">
                                    <Heading level="3" size="small" spacing>
                                        skyra.state
                                    </Heading>
                                    <p className="mb-4 leading-normal">
                                        Brukes av verktøyet Skyra for å huske brukeren og hvorvidt undersøkelser er åpnet, lukket eller fullført.
                                    </p>
                                </section>

                                <section className="pt-8">
                                    <Heading level="3" size="small" spacing>
                                        Umami
                                    </Heading>
                                    <p className="mb-4 leading-normal">
                                        Umami brukes til statistikk og analyse av hvordan innblikk.ansatt.nav.no brukes. Unami bruker ikke informasjonskapsler, men henter inn opplysninger om nettleseren din for å lage en unik ID. Denne ID-en brukes for å skille deg fra andre brukere. For å hindre identifisering, bruker vi en egenutviklet proxy som vasker bort deler av IP-adressen din før dataene sendes til verktøyet.
                                    </p>
                                </section>
                            </section>

                            <section className="pt-16">
                                <Heading level="2" size="medium" spacing>
                                    Dine rettigheter
                                </Heading>
                                <p className="mb-4 leading-normal">
                                    Du har blant annet rett til innsyn i hvilke opplysninger vi har lagret om deg. Les mer her om dine rettigheter og hvordan du gjør krav på disse <Link href="https://www.Nav.no/no/Nav-og-samfunn/om-Nav/personvern-i-arbeids-og-velferdsetaten" className="underline hover:no-underline">Personvernerklæring for ansatte i Arbeids- og velferdsetaten</Link>.
                                </p>
                            </section>

                            <section className="pt-16">
                                <Heading level="2" size="medium" spacing>
                                    Personvernombudet
                                </Heading>
                                <p className="mb-4 leading-normal">
                                    Arbeids- og velferdsetaten har et <Link href="https://www.nav.no/personvern" className="underline hover:no-underline">personvernombud</Link> som skal ivareta personverninteressene, også til de ansatte. Personvernombudet kan gi råd og veiledning generelt om Navs behandling av personopplysninger og kan hjelpe deg med å ivareta dine personverninteresser.
                                </p>
                            </section>

                            <section className="pt-16">
                                <Heading level="2" size="medium" spacing>
                                    Klage til Datatilsynet
                                </Heading>
                                <p className="leading-normal">
                                    Du har rett til å klage til Datatilsynet hvis du ikke er fornøyd med hvordan vi behandler personopplysninger om deg, eller hvis du mener behandlingen er i strid med personvernreglene. Ta først kontakt med vårt personvernombud. Informasjon om hvordan du går frem finner du på nettsidene til <Link href="https://www.datatilsynet.no/" className="underline hover:no-underline">Datatilsynet</Link>.
                                </p>
                            </section>

                            <section className="pt-16">
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

export default Personvern