/**
 * The HavenLink agency dataset used by the matching flow, transcribed from the
 * "Master State Agency Map" (partner network + the states whose licensed
 * agencies are listed inline; directory-only states are intentionally absent —
 * matching reports them as unsupported).
 *
 * Partner entries mirror public/team.html (names, URLs, descriptions, logos).
 * Non-partner websites were verified against each agency's official site in
 * July 2026; `url: null` means no official site could be confidently verified
 * (the UI then omits the "visit website" link rather than inventing one).
 *
 * Notes from verification:
 *  - "Hawaii International Child" now operates as "A Family Tree".
 *  - "Children's Bureau" (IN) is now Firefly Children & Family Alliance.
 *  - "Children's Home Society of WA" is now Akin.
 *  - "Connecting Hearts Inc. (WY)" operates as Adoption Life — the same org
 *    behind AdoptionLife.org (licensed in ID/UT/WY); the two entries share a
 *    website but have distinct per-state ids.
 *  - "Catholic Social Services of Wyoming" (Catholic Charities of Wyoming)
 *    discontinued adoption services in 2020 and is excluded.
 */

export interface Agency {
  /** Unique per (agency, state) — e.g. "adoption-beyond-ks" vs "adoption-beyond-mo". */
  id: string;
  name: string;
  /** 2-letter uppercase state code this entry serves. */
  state: string;
  partner: boolean;
  url: string | null;
  /** Logo path under public/ — partners only. */
  logo: string | null;
  description: string;
  tags: string[];
}

export const AGENCIES: Agency[] = [
  // ----- HavenLink partner network -------------------------------------------
  {
    id: "connecting-hearts-fl",
    name: "Connecting Hearts",
    state: "FL",
    partner: true,
    url: "https://www.connectingheartsadoption.com/",
    logo: "/png/connecting-hearts-logo.png",
    description:
      "A licensed adoption agency in the State of Florida, focusing on the adoption home study.",
    tags: ["Home study", "Licensed in Florida"],
  },
  {
    id: "hoaa-fl",
    name: "Hearts of Adoptions Alliance",
    state: "FL",
    partner: true,
    url: "https://adopthoaa.org/",
    logo: "/png/hoaa-logo.png",
    description:
      "A non-profit 501(c)(3) licensed child-placing agency dedicated to connecting children with safe and loving families.",
    tags: ["Child placement", "501(c)(3) non-profit"],
  },
  {
    id: "adoption-beyond-ks",
    name: "Adoption and Beyond",
    state: "KS",
    partner: true,
    url: "https://adoption-beyond.org/",
    logo: "/png/adoption-beyond.png",
    description:
      "Available to perform domestic, international, private, and embryo home study assessments.",
    tags: ["Home study", "Domestic & international"],
  },
  {
    id: "adoption-beyond-mo",
    name: "Adoption and Beyond",
    state: "MO",
    partner: true,
    url: "https://adoption-beyond.org/",
    logo: "/png/adoption-beyond.png",
    description:
      "Available to perform domestic, international, private, and embryo home study assessments.",
    tags: ["Home study", "Domestic & international"],
  },
  {
    id: "options4adoption-mo",
    name: "Options 4 Adoption",
    state: "MO",
    partner: true,
    url: "https://options4adoption.com/",
    logo: "/png/options4adoption.png",
    description:
      "Focused on preparing the adoptive family's home study report and follow-up post-placement visits.",
    tags: ["Home study", "Post-placement visits"],
  },
  {
    id: "greater-hopes-mi",
    name: "Greater Hopes",
    state: "MI",
    partner: true,
    url: "https://greaterhopes.org/",
    logo: "/png/greater-hopes.png",
    description:
      "A full-service child placing agency, licensed by the State of Michigan to perform private infant and early childhood adoption.",
    tags: ["Child placement", "Infant & early childhood"],
  },
  {
    id: "sacred-portion-mt",
    name: "The Sacred Portion Children's Outreach",
    state: "MT",
    partner: true,
    url: "https://sacredportion.org/",
    logo: "/png/sacred-portion-logo.png",
    description:
      "A faith-based nonprofit child-caring ministry in Bozeman that works internationally and domestically to place children without families and to support the expectant mothers who care for them.",
    tags: ["Placement", "Domestic & international", "Expectant mother support"],
  },
  {
    id: "lifeline-al",
    name: "Lifeline Children's Services",
    state: "AL",
    partner: true,
    url: "https://lifelinechild.org/",
    logo: "/png/lifeline-childrens-logo.png",
    description:
      "A Christian, full-service adoption and orphan-care ministry based in Birmingham serving vulnerable children and expectant mothers through domestic and international adoption, foster care, and counseling.",
    tags: ["Domestic & international", "Foster care", "Counseling"],
  },
  {
    id: "adoption-choices-fl",
    name: "Adoption Choices of Florida",
    state: "FL",
    partner: true,
    url: "https://adoptionchoicesflorida.com/",
    logo: "/png/adoption-choices-florida-logo.png",
    description:
      "A licensed, full-service agency that helps birth mothers and adoptive families build personalized adoption plans, offering statewide support and leaving major decisions in the birth mother's hands.",
    tags: ["Placement", "Birth parent support"],
  },
  {
    id: "heart-of-adoptions-fl",
    name: "Heart of Adoptions, Inc.",
    state: "FL",
    partner: true,
    url: "https://heartofadoptions.com/",
    logo: "/png/heart-of-adoptions-logo.png",
    description:
      "A licensed, private adoption agency designed to help create families through adoption.",
    tags: ["Placement", "Licensed in Florida"],
  },
  {
    id: "spence-chapin-ny",
    name: "Spence-Chapin Services to Families and Children",
    state: "NY",
    partner: true,
    url: "https://www.spence-chapin.org/",
    logo: "/png/spence-chapin-logo.png",
    description:
      "An accredited nonprofit with more than a century of experience finding loving homes for children of all needs and providing lifelong counseling to birth parents, adoptees, and adoptive families.",
    tags: ["Placement", "Counseling", "Post-adoption support"],
  },
  {
    id: "gladney-tx",
    name: "Gladney Center for Adoption",
    state: "TX",
    partner: true,
    url: "https://gladney.org/",
    logo: "/png/gladney-logo.png",
    description:
      "A Fort Worth agency operating for over 130 years under the belief that every child deserves a loving family, offering domestic and international adoption alongside lifelong support for adoptees and birth parents.",
    tags: ["Domestic & international", "Post-adoption support"],
  },
  {
    id: "the-cradle-il",
    name: "The Cradle",
    state: "IL",
    partner: true,
    url: "https://cradle.org/",
    logo: "/png/the-cradle-logo.png",
    description:
      "A nonprofit, licensed Evanston agency founded in 1923 that provides infant adoption, counseling, and education, and is the only U.S. adoption agency with an on-site nursery.",
    tags: ["Infant adoption", "Counseling"],
  },
  {
    id: "holt-international-or",
    name: "Holt International",
    state: "OR",
    partner: true,
    url: "https://www.holtinternational.org/",
    logo: "/png/holt-international-logo.png",
    description:
      "A pioneering international adoption and child-welfare organization based in Eugene that seeks a loving, secure home for every child, first through birth-family preservation and in-country placement.",
    tags: ["Domestic & international", "Family preservation"],
  },
  {
    id: "chs-north-carolina-nc",
    name: "Children's Home Society of North Carolina",
    state: "NC",
    partner: true,
    url: "https://www.chsnc.org/",
    logo: "/png/chs-north-carolina-logo.png",
    description:
      "A statewide nonprofit founded in 1902 whose mission is to promote every child's right to a permanent, safe, and loving family through adoption, foster care, family preservation, and parent education.",
    tags: ["Placement", "Foster care", "Family preservation"],
  },
  {
    id: "raise-the-future-co",
    name: "Raise the Future",
    state: "CO",
    partner: true,
    url: "https://www.raisethefuture.org/",
    logo: "/png/raise-the-future-logo.png",
    description:
      "A Denver-based nonprofit, formerly The Adoption Exchange, that connects youth waiting in foster care with permanent adult connections and supports those relationships through trauma-informed, wraparound services.",
    tags: ["Foster care", "Waiting children", "Trauma-informed"],
  },
  {
    id: "arizonas-children-az",
    name: "Arizona's Children Association",
    state: "AZ",
    partner: true,
    url: "https://www.arizonaschildren.org/",
    logo: "/png/arizonas-children-logo.png",
    description:
      "One of Arizona's oldest and largest statewide child-welfare nonprofits, founded in 1912, working to protect children, empower youth, and strengthen families through foster care, adoption, and behavioral health programs.",
    tags: ["Foster care", "Placement", "Behavioral health"],
  },
  {
    id: "adoption-network-ca",
    name: "Adoption Network Law Center",
    state: "CA",
    partner: true,
    url: "https://adoptionnetwork.com/",
    logo: "/png/adoption-network-law-center-logo.png",
    description:
      "An attorney-supervised organization that guides birth mothers and adoptive parents through domestic adoption, pairing legal protection with emotional support throughout the process.",
    tags: ["Legal services", "Birth parent support"],
  },
  {
    id: "cafaf-ct",
    name: "Connecticut Alliance of Foster and Adoptive Families",
    state: "CT",
    partner: true,
    url: "https://www.cafafct.org/",
    logo: "/png/cafaf-logo.png",
    description:
      "A statewide nonprofit that strengthens foster, adoptive, and kinship families through support, training, advocacy, and recruitment in partnership with child-welfare professionals.",
    tags: ["Foster care", "Training & advocacy"],
  },
  {
    id: "chs-minnesota-mn",
    name: "Children's Home Society of Minnesota",
    state: "MN",
    partner: true,
    url: "https://chlss.org/",
    logo: "/png/chs-minnesota-logo.png",
    description:
      "A St. Paul nonprofit dating to 1889, now partnered with Lutheran Social Service, that provides child-centered infant, international, and foster-care adoption along with post-adoption and pregnancy services.",
    tags: ["Infant adoption", "Domestic & international", "Post-adoption support"],
  },
  {
    id: "nightlight-ky",
    name: "Nightlight Christian Adoptions",
    state: "KY",
    partner: true,
    url: "https://nightlight.org/",
    logo: "/png/nightlight-logo.png",
    description:
      "A Hague-accredited Christian agency operating for over 50 years that offers domestic, international, foster, and pioneering Snowflakes embryo adoption alongside pregnancy counseling.",
    tags: ["Domestic & international", "Embryo adoption", "Counseling"],
  },
  {
    id: "adoption-services-la",
    name: "Adoption Services, Inc.",
    state: "LA",
    partner: true,
    url: "https://www.adoptionservices.org/",
    logo: "/png/adoption-services-inc-logo.png",
    description:
      "A licensed nonprofit full-service agency operating since 1985 that helps birth parents and adoptive families across the U.S. with domestic adoption and unplanned-pregnancy counseling.",
    tags: ["Placement", "Counseling"],
  },
  {
    id: "nightlight-sc",
    name: "Nightlight Christian Adoptions (Greenville)",
    state: "SC",
    partner: true,
    url: "https://nightlight.org/",
    logo: "/png/nightlight-logo.png",
    description:
      "The Greenville office of Nightlight, a Hague-accredited Christian agency providing domestic, international, foster, and embryo adoption plus pregnancy counseling.",
    tags: ["Domestic & international", "Embryo adoption", "Counseling"],
  },
  {
    id: "shineforth-va",
    name: "Shineforth",
    state: "VA",
    partner: true,
    url: "https://shineforth.org/",
    logo: "/png/shineforth-logo.png",
    description:
      "A Virginia nonprofit founded in 1900, formerly United Methodist Family Services, that champions children through treatment foster care, adoption, residential treatment, and specialized education statewide.",
    tags: ["Foster care", "Placement", "Specialized education"],
  },
  {
    id: "bright-futures-ma",
    name: "Bright Futures Adoption Center",
    state: "MA",
    partner: true,
    url: "https://www.brightfuturesadoption.org/",
    logo: "/png/bright-futures-logo.png",
    description:
      "A full-service, licensed nonprofit Massachusetts adoption agency and program of the RFK Community Alliance, promoting open adoption and giving birth and adoptive parents options and involvement throughout the process.",
    tags: ["Open adoption", "Placement", "Nonprofit"],
  },

  // ----- Georgia ---------------------------------------------------------------
  {
    id: "adoption-advocates-ga",
    name: "Adoption Advocates of Georgia",
    state: "GA",
    partner: false,
    url: "https://www.adoptionadvocatesofga.org/",
    logo: null,
    description:
      "A non-profit licensed child-placing agency with more than 35 years of experience in home studies, placement, and post-adoption support.",
    tags: ["Home study", "Placement", "Post-adoption support"],
  },
  {
    id: "aaa-partners-ga",
    name: "AAA Partners in Adoption",
    state: "GA",
    partner: false,
    url: "https://www.partnersinadoption.org/",
    logo: null,
    description:
      "One of the few Georgia agencies providing both home studies and placements, guiding birth mothers and adoptive parents since 1994.",
    tags: ["Home study", "Placement"],
  },
  {
    id: "all-gods-children-ga",
    name: "All God's Children",
    state: "GA",
    partner: false,
    url: null,
    logo: null,
    description:
      "A licensed Georgia child-placing agency working in partnership with the Georgia Department of Human Services to find families for waiting children.",
    tags: ["Placement", "Waiting children"],
  },
  {
    id: "georgia-agape-ga",
    name: "Georgia Agape",
    state: "GA",
    partner: false,
    url: "https://www.georgiaagape.org/",
    logo: null,
    description:
      "A faith-based, nationally accredited child-placing agency serving Georgia families since 1970.",
    tags: ["Home study", "Placement", "Foster care"],
  },
  {
    id: "covenant-care-ga",
    name: "Covenant Care Adoptions",
    state: "GA",
    partner: true,
    url: "https://www.covenantcareadoptions.com/",
    logo: "/png/covenant-care-logo.png",
    description:
      "A state-licensed, nonprofit Christian agency serving Georgia since 1989 that puts the expectant mother first, provides free counseling, and works to find families for children rather than children for families.",
    tags: ["Placement", "Counseling", "Expectant mother support"],
  },

  // ----- Hawaii ------------------------------------------------------------------
  {
    id: "family-options-hi",
    name: "Family Options — Hawaii",
    state: "HI",
    partner: false,
    url: "https://www.familyoptionshawaii.org/",
    logo: null,
    description:
      "Kauai's first licensed adoption agency, serving all of the Hawaiian islands from pre-placement counseling through post-placement services since 1988.",
    tags: ["Home study", "Placement", "Post-placement"],
  },
  {
    id: "hawaii-international-child-hi",
    name: "Hawaii International Child (A Family Tree)",
    state: "HI",
    partner: false,
    url: "https://www.afamilytree.org/",
    logo: null,
    description:
      "Hawai'i's only locally owned, fully licensed child placement and family services agency, licensed since 1975.",
    tags: ["Home study", "Placement", "Foster care"],
  },

  // ----- Idaho -------------------------------------------------------------------
  {
    id: "a-new-beginning-id",
    name: "A New Beginning Adoption Agency",
    state: "ID",
    partner: false,
    url: "https://adoptanewbeginning.org/",
    logo: null,
    description:
      "A licensed, non-profit agency in Boise providing U.S. infant adoption and foster-adoption services to Idaho families.",
    tags: ["Home study", "Infant adoption", "Foster-to-adopt"],
  },
  {
    id: "adoption-life-id",
    name: "AdoptionLife.org",
    state: "ID",
    partner: false,
    url: "https://adoptionlife.org/",
    logo: null,
    description:
      "A non-profit, full-service domestic infant adoption agency licensed in Idaho, Utah, and Wyoming.",
    tags: ["Home study", "Infant adoption"],
  },
  {
    id: "idaho-youth-ranch-id",
    name: "Idaho Youth Ranch Adoption Services",
    state: "ID",
    partner: false,
    url: "https://www.youthranch.org/adoption",
    logo: null,
    description:
      "Personalized open-adoption programs with support and resources for birth and adoptive parents in Idaho.",
    tags: ["Placement", "Open adoption"],
  },

  // ----- Indiana ----------------------------------------------------------------
  {
    id: "a-bond-of-life-in",
    name: "A Bond of Life Adoptions",
    state: "IN",
    partner: false,
    url: "https://abladoptions.com/",
    logo: null,
    description:
      "A full-service adoption agency serving Indiana statewide, with education and counseling for birth parents and adoptive families.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "adoption-support-center-in",
    name: "Adoption Support Center",
    state: "IN",
    partner: false,
    url: "https://adoptionsupportcenter.com/",
    logo: null,
    description:
      "An Indianapolis-area agency serving Indiana statewide, supporting birth mothers and adoptive families through the full adoption process.",
    tags: ["Home study", "Placement", "Birth-parent support"],
  },
  {
    id: "adoptions-of-indiana-in",
    name: "Adoptions of Indiana",
    state: "IN",
    partner: false,
    url: "https://adoptionsofindiana.org/",
    logo: null,
    description:
      "Professional, compassionate adoption services for adoptees, expectant and birth parents, and adoptive families.",
    tags: ["Home study", "Placement"],
  },
  {
    id: "childrens-bureau-in",
    name: "Children's Bureau (Firefly Children & Family Alliance)",
    state: "IN",
    partner: false,
    url: "https://fireflyin.org/",
    logo: null,
    description:
      "Serving Indiana children since 1851, with affordable private adoption services from a trauma-informed, attachment-based perspective.",
    tags: ["Home study", "Placement", "Trauma-informed"],
  },
  {
    id: "kidsfirst-in",
    name: "KidsFirst Adoption Services",
    state: "IN",
    partner: true,
    url: "https://kidsfirstadoption.com/",
    logo: "/png/kidsfirst-logo.png",
    description:
      "A private, licensed Indianapolis agency that has supported expectant and hopeful parents for over 20 years, handling both domestic placements and international adoptions from countries including Bulgaria and Ukraine.",
    tags: ["Home study", "Domestic & international"],
  },

  // ----- Iowa --------------------------------------------------------------------
  {
    id: "abbys-one-true-gift-ia",
    name: "Abby's One True Gift Adoptions",
    state: "IA",
    partner: false,
    url: "https://www.onetruegift.com/",
    logo: null,
    description:
      "A full-service licensed agency in Waukee with more than 1,200 completed adoptions, offering home study and post-placement services.",
    tags: ["Home study", "Placement", "Post-placement"],
  },
  {
    id: "adoption-connection-ia",
    name: "Adoption Connection — Iowa",
    state: "IA",
    partner: false,
    url: "https://www.adoptioniowa.com/",
    logo: null,
    description:
      "A locally owned, fully licensed child-placement agency offering open, semi-open, and closed adoptions.",
    tags: ["Placement", "Open adoption"],
  },
  {
    id: "children-families-iowa-ia",
    name: "Children and Families of Iowa",
    state: "IA",
    partner: false,
    url: "https://cfiowa.org/",
    logo: null,
    description:
      "A statewide non-profit improving the lives of Iowa children and families, with adoption services and family support.",
    tags: ["Placement", "Family services"],
  },
  {
    id: "lutheran-services-iowa-ia",
    name: "Lutheran Services in Iowa",
    state: "IA",
    partner: false,
    url: "https://lsiowa.org/foster-care-adoption/",
    logo: null,
    description:
      "One of Iowa's largest human-services agencies, supporting foster care and adoption statewide.",
    tags: ["Foster care", "Adoption support"],
  },
  {
    id: "four-oaks-ia",
    name: "Four Oaks Family & Children's Services",
    state: "IA",
    partner: false,
    url: "https://fouroaks.org/",
    logo: null,
    description:
      "Contracted by the State of Iowa to recruit, train, license, and support Iowa's foster and adoptive families.",
    tags: ["Foster care", "Adoption", "Training & licensing"],
  },

  // ----- Kentucky ----------------------------------------------------------------
  {
    id: "adoption-assistance-ky",
    name: "Adoption Assistance",
    state: "KY",
    partner: false,
    url: "https://www.adoptionassistance.com/",
    logo: null,
    description:
      "A non-profit child-placing agency licensed in Kentucky, Tennessee, and Indiana: home studies, post-placement reports, finalization, and placement.",
    tags: ["Home study", "Placement", "Finalization"],
  },
  {
    id: "adoption-bridges-ky",
    name: "Adoption Bridges of Kentuckiana",
    state: "KY",
    partner: false,
    url: "https://www.adoptionbridges.org/",
    logo: null,
    description:
      "A licensed, accredited non-profit serving Kentucky and Southern Indiana birth parents and adoptive families since 1989.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "bellewood-brooklawn-ky",
    name: "Bellewood & Brooklawn",
    state: "KY",
    partner: false,
    url: "https://bellewoodandbrooklawn.org/",
    logo: null,
    description:
      "A Kentucky institution with a 170-year history, offering therapeutic foster care and family services across all 120 counties.",
    tags: ["Foster care", "Therapeutic care"],
  },
  {
    id: "home-of-the-innocents-ky",
    name: "Home of the Innocents",
    state: "KY",
    partner: false,
    url: "https://homeoftheinnocents.org/",
    logo: null,
    description:
      "A Louisville institution since 1880, providing therapeutic foster care and adoption services for at-risk children.",
    tags: ["Foster care", "Adoption", "Therapeutic care"],
  },
  {
    id: "sunrise-childrens-ky",
    name: "Sunrise Children's Services",
    state: "KY",
    partner: false,
    url: "https://www.sunrise.org/",
    logo: null,
    description:
      "Serving Kentucky kids for over 155 years; its foster-to-adopt program has celebrated more than 500 adoptions since 2006.",
    tags: ["Foster-to-adopt", "Residential care"],
  },

  // ----- Montana -----------------------------------------------------------------
  {
    id: "catholic-social-services-mt",
    name: "Catholic Social Services of Montana",
    state: "MT",
    partner: false,
    url: "https://www.cssmt.org/",
    logo: null,
    description:
      "A statewide licensed adoption agency since 1953, open to families of all faiths.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "hopefull-connections-mt",
    name: "HopeFull Connections Adoption Services",
    state: "MT",
    partner: false,
    url: "https://hopefullconnections.org/",
    logo: null,
    description:
      "A faith-based, Hague-accredited licensed child-placing agency in Bozeman providing home studies and post-adoption supervision.",
    tags: ["Home study", "Hague-accredited", "Post-adoption"],
  },
  {
    id: "st-johns-united-mt",
    name: "St. John's United Family Services",
    state: "MT",
    partner: false,
    url: "https://www.stjohnsunited.org/services/family/",
    logo: null,
    description:
      "A full-service adoption agency licensed by the State of Montana, guiding and supporting all members of the adoption triad.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "youth-homes-mt",
    name: "Youth Homes — Dan Fox Family Care",
    state: "MT",
    partner: false,
    url: "https://youthhomesmt.org/locations/dan-fox-family-care-program/",
    logo: null,
    description:
      "A Missoula-based foster care and adoption program placing children with recruited, screened, trained, and licensed families.",
    tags: ["Foster care", "Adoption", "Permanency"],
  },

  // ----- New Jersey --------------------------------------------------------------
  {
    id: "a-loving-choice-nj",
    name: "A Loving Choice Adoption Associates",
    state: "NJ",
    partner: false,
    url: "https://www.alovingchoice.org/",
    logo: null,
    description:
      "A licensed private non-profit serving all of New Jersey with individualized adoption plans, home studies, and counseling.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "adoptions-from-the-heart-nj",
    name: "Adoptions from the Heart",
    state: "NJ",
    partner: false,
    url: "https://afth.org/",
    logo: null,
    description:
      "A non-profit agency licensed across the mid-Atlantic that has placed more than 6,000 infants since 1985.",
    tags: ["Home study", "Infant adoption"],
  },
  {
    id: "chs-new-jersey-nj",
    name: "Children's Home Society of New Jersey",
    state: "NJ",
    partner: false,
    url: "https://chsofnj.org/",
    logo: null,
    description:
      "A licensed adoption agency serving New Jersey children and families since 1894.",
    tags: ["Home study", "Placement", "Birth-parent services"],
  },
  {
    id: "childrens-aid-family-services-nj",
    name: "Children's Aid & Family Services",
    state: "NJ",
    partner: false,
    url: "https://cafsnj.org/",
    logo: null,
    description:
      "Founded in 1899, this agency has placed more than 11,000 children with loving families and offers placement and post-adoption services.",
    tags: ["Placement", "Post-adoption"],
  },
  {
    id: "open-arms-nj",
    name: "Open Arms Adoption Network",
    state: "NJ",
    partner: false,
    url: "https://openarmsadoption.net/",
    logo: null,
    description:
      "A licensed adoption network with New Jersey offices serving women facing unplanned pregnancies and families looking to adopt.",
    tags: ["Home study", "Placement", "Birth-parent support"],
  },

  // ----- Pennsylvania ------------------------------------------------------------
  {
    id: "adoptions-from-the-heart-pa",
    name: "Adoptions From The Heart",
    state: "PA",
    partner: true,
    url: "https://afth.org/",
    logo: "/png/afth-logo.png",
    description:
      "One of the East Coast's leading private nonprofit agencies, a pioneer of open adoption since 1985 that serves birth parents, adoptive families, and adoptees with equal care across six states.",
    tags: ["Open adoption", "Infant adoption"],
  },
  {
    id: "adoption-connection-pa",
    name: "Adoption Connection PA",
    state: "PA",
    partner: false,
    url: "https://www.adoptionconnectionpa.org/",
    logo: null,
    description:
      "A full-service, non-profit foster care and adoption agency licensed by the Commonwealth of Pennsylvania since 1995.",
    tags: ["Home study", "Placement", "Foster care"],
  },
  {
    id: "bethanna-pa",
    name: "Bethanna",
    state: "PA",
    partner: false,
    url: "https://bethanna.org/",
    logo: null,
    description:
      "Adoption, child welfare, and behavioral health care across Philadelphia and Central Pennsylvania; a SWAN affiliate.",
    tags: ["Adoption", "Foster care", "SWAN affiliate"],
  },
  {
    id: "common-sense-pa",
    name: "Common Sense Adoption Services",
    state: "PA",
    partner: false,
    url: "https://commonsenseadoption.org/",
    logo: null,
    description:
      "A licensed non-profit in Central Pennsylvania connecting children who need permanent homes with adoptive and foster parents.",
    tags: ["Home study", "Placement", "Foster care"],
  },
  {
    id: "holt-international-pa",
    name: "Holt International — PA",
    state: "PA",
    partner: false,
    url: "https://www.holtinternational.org/",
    logo: null,
    description:
      "A Hague-accredited leader in international and U.S. adoption with licensed offices in Pennsylvania.",
    tags: ["Home study", "International adoption"],
  },

  // ----- Tennessee ---------------------------------------------------------------
  {
    id: "adoption-assistance-tn",
    name: "Adoption Assistance — TN",
    state: "TN",
    partner: false,
    url: "https://www.adoptionassistance.com/",
    logo: null,
    description:
      "A non-profit child-placing agency licensed in Tennessee, Kentucky, and Indiana, with a Tennessee office in Murfreesboro.",
    tags: ["Home study", "Placement"],
  },
  {
    id: "agape-nashville-tn",
    name: "AGAPE Nashville",
    state: "TN",
    partner: false,
    url: "https://www.agapenashville.org/",
    logo: null,
    description:
      "Maternity care, adoption, and foster care services strengthening Tennessee children and families.",
    tags: ["Placement", "Foster care", "Maternity care"],
  },
  {
    id: "harmony-family-center-tn",
    name: "Harmony Family Center",
    state: "TN",
    partner: true,
    url: "https://harmonyfamilycenter.org/",
    logo: "/png/harmony-family-center-logo.png",
    description:
      "A Knoxville nonprofit serving Tennessee since 1996 that creates opportunities for healing and growth through foster and adoptive home studies, permanency work, and trauma-informed therapeutic services.",
    tags: ["Home study", "Post-adoption", "Therapeutic services"],
  },
  {
    id: "miriams-promise-tn",
    name: "Miriam's Promise",
    state: "TN",
    partner: false,
    url: "https://miriamspromise.org/",
    logo: null,
    description:
      "A Nashville child-placing agency founded in 1985 offering domestic and international adoption services and home studies.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "small-world-tn",
    name: "Small World Adoption",
    state: "TN",
    partner: false,
    url: "https://smallworldadoption.com/",
    logo: null,
    description:
      "A non-profit public-benefit charity with Tennessee offices providing domestic and international adoption programs.",
    tags: ["Placement", "Domestic & international"],
  },

  // ----- Washington --------------------------------------------------------------
  {
    id: "a-childs-dream-wa",
    name: "A Child's Dream",
    state: "WA",
    partner: false,
    url: "https://www.achildsdream.org/",
    logo: null,
    description:
      "A licensed non-profit child-placement agency serving Washington birth parents and adoptive families since 1998.",
    tags: ["Home study", "Placement", "Birth-parent support"],
  },
  {
    id: "amara-wa",
    name: "Amara",
    state: "WA",
    partner: true,
    url: "https://amarafamily.org/",
    logo: "/png/amara-logo.png",
    description:
      "A Seattle- and Tacoma-based nonprofit serving children and families in foster care and adoption across Western Washington, focused on long-term outcomes, healing from trauma, and equity.",
    tags: ["Foster-to-adopt", "Post-adoption"],
  },
  {
    id: "chs-washington-wa",
    name: "Children's Home Society of WA (Akin)",
    state: "WA",
    partner: false,
    url: "https://akinfamily.org/",
    logo: null,
    description:
      "Washington's oldest children's non-profit — now Akin — offering family and adoption support statewide.",
    tags: ["Family services", "Adoption support"],
  },
  {
    id: "lcsnw-wa",
    name: "Lutheran Community Services NW",
    state: "WA",
    partner: false,
    url: "https://lcsnw.org/",
    logo: null,
    description:
      "A multi-state human-services agency supporting Washington children and families through foster care programs.",
    tags: ["Foster care", "Family services"],
  },
  {
    id: "holt-international-wa",
    name: "Holt International — WA",
    state: "WA",
    partner: false,
    url: "https://www.holtinternational.org/",
    logo: null,
    description:
      "A Hague-accredited leader in international and U.S. adoption with licensed offices in Washington.",
    tags: ["Home study", "International adoption"],
  },

  // ----- Wisconsin ---------------------------------------------------------------
  {
    id: "adoption-avenues-wi",
    name: "Adoption Avenues",
    state: "WI",
    partner: false,
    url: "https://www.adoptionave.com/",
    logo: null,
    description:
      "A Wisconsin-licensed child-placing agency in Janesville offering home studies, placement, and post-placement supervision.",
    tags: ["Home study", "Placement", "Post-placement"],
  },
  {
    id: "adoption-choice-wi",
    name: "Adoption Choice",
    state: "WI",
    partner: false,
    url: "https://adoptionchoiceinc.org/",
    logo: null,
    description:
      "A fully licensed non-profit serving all of Wisconsin for 40 years with ethical adoption education, guidance, and lifelong support.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "adoptions-of-wisconsin-wi",
    name: "Adoptions of Wisconsin",
    state: "WI",
    partner: false,
    url: "https://adoptionsofwisconsin.com/",
    logo: null,
    description:
      "A full-service adoption agency based in Madison, working with families throughout the state.",
    tags: ["Home study", "Placement"],
  },
  {
    id: "lcfs-wisconsin-wi",
    name: "Lutheran Counseling & Family Services of WI",
    state: "WI",
    partner: false,
    url: "https://lcfswi.org/",
    logo: null,
    description:
      "One of Wisconsin's oldest adoption agencies — over 127 years — licensed to place children in 38 counties.",
    tags: ["Home study", "Placement", "Counseling"],
  },
  {
    id: "anu-family-services-wi",
    name: "Anu Family Services",
    state: "WI",
    partner: false,
    url: "https://www.anufs.org/",
    logo: null,
    description:
      "A non-profit treatment foster care agency creating permanent connections to loving, stable families across Wisconsin.",
    tags: ["Foster care", "Permanency"],
  },

  // ----- Wyoming -----------------------------------------------------------------
  // Catholic Social Services of Wyoming is intentionally absent: it
  // discontinued adoption services in 2020.
  {
    id: "bethany-wy",
    name: "Bethany Christian Services — WY",
    state: "WY",
    partner: false,
    url: "https://bethany.org/locations/us/wyoming/cheyenne",
    logo: null,
    description:
      "The Cheyenne office of a national Christian organization offering foster care and adoption services in Wyoming.",
    tags: ["Placement", "Foster care"],
  },
  {
    id: "ccai-wy",
    name: "CCAI Adoption Services",
    state: "WY",
    partner: false,
    url: "https://ccaifamily.org/",
    logo: null,
    description:
      "A Hague-accredited international adoption agency providing home study services in Wyoming.",
    tags: ["Home study", "International adoption"],
  },
  {
    id: "connecting-hearts-wy",
    name: "Connecting Hearts Inc. (WY)",
    state: "WY",
    partner: false,
    url: "https://adoptionlife.org/",
    logo: null,
    description:
      "Operating as Adoption Life — a non-profit full-service adoption agency licensed in Wyoming, Idaho, and Utah.",
    tags: ["Home study", "Infant adoption"],
  },
  {
    id: "wyoming-childrens-society-wy",
    name: "Wyoming Children's Society",
    state: "WY",
    partner: false,
    url: "https://www.wyomingcs.org/",
    logo: null,
    description:
      "Wyoming's oldest adoption agency: home studies, matching and placement, and post-adoption support.",
    tags: ["Home study", "Placement", "Post-adoption"],
  },
];

const byId = new Map(AGENCIES.map((a) => [a.id, a]));

export function findAgency(id: string): Agency | undefined {
  return byId.get(id);
}

/**
 * All agencies usable for matching in `state`. Partners take priority: when a
 * state has any partner agencies, the pool is partners ONLY (so e.g. Kansas
 * non-partner agencies are shadowed by Adoption and Beyond). Returns [] for
 * unsupported (directory-only) states.
 */
export function agenciesForState(state: string | null): Agency[] {
  if (!state) return [];
  const inState = AGENCIES.filter((a) => a.state === state);
  const partners = inState.filter((a) => a.partner);
  return partners.length > 0 ? partners : inState;
}

export function isPartnerState(state: string | null): boolean {
  if (!state) return false;
  return AGENCIES.some((a) => a.state === state && a.partner);
}

export function isSupportedState(state: string | null): boolean {
  return agenciesForState(state).length > 0;
}
