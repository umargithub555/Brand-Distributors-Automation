from backend.models.schemas import ColdOutreachTargetRequest, DistributorRequest


def _product_context_line(req: DistributorRequest) -> str:
    if req.product_context and req.product_context.strip():
        return f"Reference product context: {req.product_context.strip()}"
    return "Reference product context: not provided"


def _brand_disambiguation_rules(req: DistributorRequest) -> str:
    if req.product_context and req.product_context.strip():
        return f"""
            DISAMBIGUATION RULES:
            - Multiple businesses can share the same brand name. Prioritize the entity whose products, category, or product pages best match this reference product context: {req.product_context.strip()}
            - Explicitly reject similarly named but unrelated companies, product lines, resellers, and local businesses.
            - If ambiguity still remains after diligent searching, say so clearly in the notes rather than forcing a match.
        """
    return """
            DISAMBIGUATION RULES:
            - If multiple businesses share the same brand name, use the strongest official evidence to determine the correct brand entity.
            - If ambiguity remains, say so clearly in the notes rather than forcing a match.
        """


def build_brand_research_prompt(req: DistributorRequest) -> str:
    return f"""
            You are an expert B2B market research analyst conducting corporate due diligence.

            Brand: {req.brand}
            Country: {req.country}
            {_product_context_line(req)}

            {_brand_disambiguation_rules(req)}

            Your task has THREE priority objectives, in this order. Do not skip or shortcut objective 1 or 2 to save time on objective 3.

            OBJECTIVE 1 - PARENT COMPANY (mandatory dedicated search):
            - Search specifically for "{req.brand} parent company", "{req.brand} owned by", "{req.brand} corporate structure", and check the brand's official "About Us"/investor relations pages.
            - Identify the ultimate parent/holding company if the brand is a subsidiary. If the brand IS the parent (no parent exists), state that explicitly rather than leaving it ambiguous.
            - Identify the official corporate website of the brand itself.
            - Treat the official website/domain as the canonical source for later contact-page selection. If search results show multiple domains (.com, .us, regional storefronts, reseller pages, stale mirrors), explicitly determine which one is the brand's current official site before selecting any contact page.

            OBJECTIVE 1B - PARENT COMPANY CONTACT (mandatory dedicated search, only if a parent company exists):
            - If a parent company was identified in Objective 1, search specifically for "[parent company] investor relations contact", "[parent company] media contact", "[parent company] press contact", "[parent company] corporate contact email".
            - Parent companies rarely publish a general-purpose public email. What you will most often find is one of: an investor relations email, a media/press relations email, or a general corporate contact form/email. Capture whichever exists, and note explicitly which type it is - this matters more than finding just any email.
            - If the brand IS the parent company (no separate parent exists, as confirmed in Objective 1), state that explicitly and leave the parent contact fields null - do not fall back to reusing the brand-level email for this field.
            - Only report an email if you actually see it written in a search result or fetched page - never guess a likely-looking address from a domain pattern.
            - If no direct email exists but the company clearly routes contact through a portal, contact form, supplier portal, marketplace messaging, or retailer onboarding form, capture that explanation explicitly.

            OBJECTIVE 2 - BRAND-LEVEL CONTACT DETAILS (mandatory dedicated search):
            - Search specifically for "{req.brand} customer service contact", "{req.brand} contact us", "{req.brand} headquarters phone emails".
            - Locate the brand's official contact page URL, verified general/corporate email addresses, a verified phone number, and the best directly observed physical address or headquarters/mailing address with postal code if published.
            - Only report emails or a phone number if you actually see it written in a search result or fetched page - never guess a likely-looking address or number from a domain name pattern.
            - If no brand email is published but the official site clearly directs contact through a form, portal, or alternate support channel, capture that explanation explicitly.

            OBJECTIVE 3 - DISTRIBUTORS (broad search, then mandatory enrichment per entity):
            1. Search comprehensively for distribution channels, including:
            - Official distributors / Authorized partners
            - Master distributors / Regional brokers
            - Commercial beverage/food/industrial wholesalers (depending on industry)
            - Distributor locator pages / "Where to buy" merchant portals
            - B2B supply channels handling the brand
            2. Prioritize information from the brand's official portals, regional business filings, and confirmed B2B supplier networks.
            3. MANDATORY ENRICHMENT STEP - for EACH distributor company you find, before moving to the next one, run additional searches to fill in:
            - Full street address
            - City, state, country
            - A specific email address
            - A specific phone number
            - The source URL where each of these specific facts was found
            Do not report a distributor with only a name and homepage URL.
            4. For the official determination, you must be able to point to a specific piece of evidence.
            5. Include both national broad-line corporate suppliers and localized regional trade wholesalers.
            6. Only if a genuinely diligent enrichment search still turns up nothing for a field, mark that specific field null.

            CRITICAL ACCURACY RULE: Never fabricate, infer, or complete an email or phone number. If unverified, write unknown.

            Write out your findings in clear, structured detail: parent company section, brand contact section, then a list of distributor profiles with whatever contact data was actually verified.
            For EACH distributor profile, explicitly write separate labeled lines for: name, website, street address, city, state, postal code, country, email, email-unavailable explanation, phone, contact page, evidence, and source URL(s).
    """


def build_brand_profile_research_prompt(req: DistributorRequest) -> str:
    return f"""
            You are an expert B2B market research analyst doing only brand and parent-company profiling.

            Brand: {req.brand}
            Country: {req.country}
            {_product_context_line(req)}

            {_brand_disambiguation_rules(req)}

            This step is ONLY for brand identity, official website selection, parent-company determination, and contact-surface discovery.
            Do not spend search effort looking for distributors in this step.

            Required work:
            1. Determine whether {req.brand} is an independent company or owned by a parent company.
            2. Identify the brand's canonical official website/domain. If multiple domains appear, explicitly choose the current official one and explain why.
            3. Find the best current official brand contact page for automation or direct outreach.
            4. Find directly observed brand-level public emails, phone numbers, and the best physical address or headquarters/mailing address with postal code, if any.
            5. If a parent company exists, find:
            - parent company name
            - canonical parent-company website/domain
            - best current official parent-company contact page
            - directly observed parent-company email and its type: investor_relations, media_press, corporate_general, or unknown
            6. If the brand itself is the parent company, state that explicitly.

            Accuracy rules:
            - Never guess emails, phone numbers, or domains.
            - Only include contact details you directly observed.
            - Prefer official websites and first-party pages over third-party summaries.

            Output format:
            - Brand identity summary
            - Parent company summary
            - Canonical website decision
            - Brand contact details
            - Parent-company contact details
            - Any conflicts or ambiguity
    """


def build_brand_distributor_discovery_prompt(req: DistributorRequest, brand_profile_text: str) -> str:
    return f"""
            You are an expert B2B market research analyst doing distributor discovery only.

            Brand: {req.brand}
            Country: {req.country}
            {_product_context_line(req)}

            {_brand_disambiguation_rules(req)}

            Brand profile notes from an earlier step:
            {brand_profile_text}

            Your task is to discover the best candidate distributors, wholesalers, supply partners, or regional trade distributors for this brand in {req.country}.
            Do not spend search effort redoing parent-company or generic contact research unless needed to validate distributor evidence.

            Required work:
            1. Search broadly for candidate distributors, authorized partners, wholesale suppliers, food/beverage distributors, and brand-related B2B channel partners.
            2. Include both national and regional distributor candidates if there is evidence they handle the brand.
            3. For each candidate, capture:
            - distributor company name
            - why it appears to distribute or supply the brand
            - whether the evidence looks official/strong or weaker/indirect
            - any obvious geography served
            - any immediately visible website or source URL
            4. Exclude obvious retailers, consumers, directories with no actual evidence, and unrelated wholesalers.
            5. Be exhaustive before stopping.

            Accuracy rules:
            - Do not invent evidence.
            - If a candidate relationship is weak, say so explicitly instead of presenting it as confirmed.

            Output format:
            - Discovery summary
            - Candidate distributor list
            - For each candidate: name, evidence, geography, confidence, source URLs
            - A short note on which candidates most deserve enrichment
    """


def build_brand_distributor_enrichment_prompt(
    req: DistributorRequest,
    brand_profile_text: str,
    distributor_discovery_text: str,
) -> str:
    return f"""
            You are an expert B2B market research analyst doing distributor enrichment only.

            Brand: {req.brand}
            Country: {req.country}
            {_product_context_line(req)}

            {_brand_disambiguation_rules(req)}

            Brand profile notes:
            {brand_profile_text}

            Distributor discovery notes:
            {distributor_discovery_text}

            Your task is to enrich the distributor candidates already identified above.
            Focus your search effort on those companies instead of searching broadly again.

            For EACH credible distributor candidate, try to verify and capture:
            - company website
            - full street address
            - city
            - state or region
            - country
            - postal code
            - public email address
            - if no public email exists, a brief factual reason why (for example supplier portal only, centralized contact form, marketplace messaging only)
            - public phone number
            - contact page URL
            - evidence showing whether the distributor is official/authorized or just a likely commercial supplier
            - the source URL(s) supporting the enrichment

            Rules:
            - Do not report a distributor as enriched unless you attempted dedicated follow-up research on that entity.
            - If a field cannot be verified after diligent follow-up, mark it unknown in the notes.
            - Never fabricate emails, phone numbers, or addresses.
            - Keep distributor names stable and consistent with the discovery step when referring to the same entity.

            Output format:
            - Enriched distributor profiles
            - One section per distributor candidate
            - For each section include: name, official/likely status, website, address, city, state, postal code, country, email, email-unavailable explanation if applicable, phone, contact page, supporting evidence, source URLs
            - Final note listing any candidates rejected during enrichment and why
    """


def build_brand_structuring_prompt(req: DistributorRequest, research_text: str) -> str:
    return f"""
            Based on the research notes below, extract and structure the information into the required schema.

            Brand: {req.brand}
            Country: {req.country}
            {_product_context_line(req)}

            {_brand_disambiguation_rules(req)}

            Research notes:
            {research_text}

            Follow these rules:
            - Populate parent_company, official_website, brand_address, brand_postal_code, parent_company_contact_page, brand_contact_page, brand_emails, brand_phone, and parent_company_phone from the notes.
            - Use the product context only to resolve identity ambiguity in the notes. Do not add new output fields or change the JSON schema.
            - brand_contact_page must be the official brand contact page most suitable for automated form filling.
            - brand_contact_page must be on the same canonical official domain as official_website, unless the notes explicitly prove otherwise.
            - parent_company_contact_page must be the official parent-company contact page most suitable for automated form filling.
            - parent_company_contact_page must be on the parent company's canonical official domain and only be returned if current and live.
            - If conflicting contact-page candidates exist, choose the best supported one; if none can be confirmed confidently, return null.
            - Map all identified distributors into the distributors array.
            - For each distributor, explicitly populate website, address, city, state, postal_code, country, email, email_unavailable_reason, phone, contact_page, official, source, and confidence whenever those facts appear in the notes.
            - Distributor phone numbers must be copied into the phone field whenever a directly observed phone number is present in the research notes. Do not leave phone null if the notes clearly contain a verified distributor phone number.
            - Distributor contact-page URLs must be copied into contact_page whenever the notes clearly contain a distributor contact or support page.
            - Use the best supporting source URL from the notes in the source field whenever available.
            - Never fabricate contact details, emails, phone numbers, or parent companies.
            - Populate parent_company_email and parent_company_email_type from the notes. If no directly observed email exists, return null and populate parent_company_email_unavailable_reason when the notes explain the alternative contact route.
            - Populate brand_email_unavailable_reason when the notes explain why no direct brand email is available.
            - Populate distributor email_unavailable_reason when a distributor has no direct email but the notes explain the alternative contact route.
            - Preserve the same output schema exactly; the only acceptable output is the schema-compliant JSON response.
        """


def build_cold_target_research_prompt(req: ColdOutreachTargetRequest) -> str:
    target_categories = ', '.join(req.target_categories) if req.target_categories else 'any business category that appears promising for outbound sales'
    exclude_categories = ', '.join(req.exclude_categories) if req.exclude_categories else 'none'
    profile = req.ideal_customer_profile or 'No special profile was provided, so use general B2B cold outreach potential based on commercial fit, contactability, and business maturity.'
    return f"""
            You are a senior outbound sales researcher building a ranked lead list for cold outreach.

            Location center: {req.city}, {req.state}, USA
            Radius: {req.radius_km} km
            Max results: {req.max_results}
            Ideal customer profile: {profile}
            Prioritize categories: {target_categories}
            Exclude categories: {exclude_categories}

            Your job is to find genuinely local businesses within the requested radius that are promising outreach targets and then rank them by potential.

            Required research process:
            1. Search for businesses in and around the city using multiple queries, including city + category combinations, maps-like business listings, chamber or local directory mentions, and official company websites.
            2. Only keep targets that appear to be inside the requested radius or close enough that the evidence strongly supports inclusion.
            3. For each candidate business, verify and record as many of these as actually observed:
            - official website
            - official contact page
            - public email address
            - if no public email exists, a brief factual reason why (for example supplier portal only, centralized contact form, marketplace messaging only)
            - public phone number
            - full street address
            - city, state, postal code
            - business category / vertical
            - distance from the search center in kilometers if the evidence allows a reasonable estimate
            4. Exclude businesses that clearly do not fit the requested categories, are outside the radius, are permanently closed, or have almost no verifiable contact surface.
            5. Rank the final businesses by outreach potential, not by fame. Potential should consider:
            - fit to the ideal customer profile
            - signs the business is active and real
            - quality of contactability such as email, phone, and contact page availability
            - business scale or seriousness where evidence exists
            - whether the target looks worth a sales rep's time
            6. For every target, include a short reason explaining why it ranks where it does.
            7. Never invent email addresses, phone numbers, addresses, websites, or distances. If not verified, leave them unknown in the notes.

            Output detailed research notes first, with one section per candidate target, followed by a final ranked shortlist.
    """


def build_cold_target_structuring_prompt(req: ColdOutreachTargetRequest, research_text: str) -> str:
    return f"""
            Convert the following research notes into the required JSON schema for cold outreach targets.

            Search center city: {req.city}
            Search center state: {req.state}
            Radius: {req.radius_km} km
            Ideal customer profile: {req.ideal_customer_profile or 'not provided'}
            Target categories: {', '.join(req.target_categories) if req.target_categories else 'not provided'}
            Excluded categories: {', '.join(req.exclude_categories) if req.exclude_categories else 'not provided'}
            Requested max results: {req.max_results}

            Research notes:
            {research_text}

            Rules:
            - Return at most {req.max_results} targets.
            - Sort targets from highest potential_score to lowest potential_score.
            - potential_score must reflect outreach potential, not popularity.
            - Include only businesses that appear to be within the requested radius in or around {req.city}, {req.state}.
            - Keep only data that is actually supported by the research notes.
            - Do not guess or infer emails, phone numbers, websites, postal codes, or contact pages.
            - source_urls should contain the most relevant URLs that supported the result.
            - ranking_reason should be concise and specific.
            - total_targets must equal the number of items in targets.
        """
