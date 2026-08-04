from typing import List, Optional

from pydantic import BaseModel, Field


class DistributorRequest(BaseModel):
    brand: str
    country: str


class BrandUploadItem(BaseModel):
    brand: str
    country: str = 'USA'


class BulkUploadRequest(BaseModel):
    brands: List[BrandUploadItem]


class BrandProcessingTriggerRequest(BaseModel):
    research_mode: str = Field(default='short', description="Brand research mode: 'detailed' for staged research or 'short' for the legacy single-pass flow")


class BrandBulkProcessingTriggerRequest(BaseModel):
    brand_ids: List[str] = Field(default_factory=list)
    research_mode: str = Field(default='short', description="Brand research mode: 'detailed' for staged research or 'short' for the legacy single-pass flow")


class BrandBulkProcessingCancelRequest(BaseModel):
    brand_ids: List[str] = Field(default_factory=list)


class Distributor(BaseModel):
    name: str = Field(description='Distributor, commercial wholesaler, or regional supplier company name')
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    email_unavailable_reason: Optional[str] = None
    phone: Optional[str] = Field(default=None, description='Directly observed public distributor phone number when explicitly present in the research notes')
    contact_page: Optional[str] = Field(default=None, description='Official distributor contact page URL or support/contact form URL when explicitly present in the research notes')
    official: bool = Field(description='True if verified as an authorized/commercial supplier, false if a secondary general wholesaler')
    source: Optional[str] = Field(default=None, description='Best supporting source URL for the distributor relationship or contact details from the research notes')
    confidence: int = Field(ge=0, le=100)


class EditableDistributor(BaseModel):
    name: str
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: Optional[str] = None
    email: Optional[str] = None
    email_unavailable_reason: Optional[str] = None
    phone: Optional[str] = None
    contact_page: Optional[str] = None
    official: bool = False
    source: Optional[str] = None
    confidence: int = Field(default=50, ge=0, le=100)


class BrandUpdateRequest(BaseModel):
    brand: str
    country: str = 'USA'
    parent_company: Optional[str] = None
    official_website: Optional[str] = None
    brand_address: Optional[str] = None
    brand_postal_code: Optional[str] = None
    brand_contact_page: Optional[str] = None
    parent_company_contact_page: Optional[str] = None
    brand_phone: Optional[str] = None
    parent_company_phone: Optional[str] = None
    brand_emails: List[str] = Field(default_factory=list)
    brand_email_unavailable_reason: Optional[str] = None
    parent_company_email: Optional[str] = None
    parent_company_email_type: Optional[str] = None
    parent_company_email_unavailable_reason: Optional[str] = None
    distributors: List[EditableDistributor] = Field(default_factory=list)


class ResearchStepMetrics(BaseModel):
    label: str
    model: str
    duration_seconds: float = Field(ge=0)
    prompt_tokens: int = Field(default=0, ge=0)
    candidate_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    grounding_billing_mode: str = 'none'
    grounding_search_queries: int = Field(default=0, ge=0)
    billable_grounding_units: int = Field(default=0, ge=0)
    web_search_queries: List[str] = Field(default_factory=list)
    estimated_input_cost_usd: Optional[float] = Field(default=None, ge=0)
    estimated_output_cost_usd: Optional[float] = Field(default=None, ge=0)
    estimated_grounding_cost_usd: float = Field(default=0, ge=0)
    estimated_total_cost_usd: Optional[float] = Field(default=None, ge=0)


class ResearchRunMetrics(BaseModel):
    request_type: str
    model: str
    pricing_tier: str = 'standard'
    status: str
    started_at: str
    completed_at: str
    prompt_tokens: int = Field(default=0, ge=0)
    candidate_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    grounding_billing_mode: str = 'none'
    grounding_search_queries: int = Field(default=0, ge=0)
    billable_grounding_units: int = Field(default=0, ge=0)
    web_search_queries: List[str] = Field(default_factory=list)
    estimated_input_cost_usd: Optional[float] = Field(default=None, ge=0)
    estimated_output_cost_usd: Optional[float] = Field(default=None, ge=0)
    estimated_grounding_cost_usd: float = Field(default=0, ge=0)
    estimated_total_cost_usd: Optional[float] = Field(default=None, ge=0)
    steps: List[ResearchStepMetrics] = Field(default_factory=list)
    metrics_log_id: Optional[str] = None
    notes: Optional[str] = None


class Output(BaseModel):
    brand: str
    country: str
    parent_company: Optional[str] = None
    official_website: Optional[str] = None
    brand_address: Optional[str] = None
    brand_postal_code: Optional[str] = None
    parent_company_email: Optional[str] = None
    parent_company_email_type: Optional[str] = Field(
        default=None,
        description="Type of contact this email reaches: 'investor_relations', 'media_press', 'corporate_general', or 'unknown'",
    )
    parent_company_contact_page: Optional[str] = Field(
        default=None,
        description="Parent company's official contact page URL, preferably the page containing a contact form or leading directly to one",
    )
    brand_contact_page: Optional[str] = None
    brand_emails: Optional[list] = []
    brand_email_unavailable_reason: Optional[str] = None
    brand_phone: Optional[str] = None
    parent_company_phone: Optional[str] = None
    parent_company_email_unavailable_reason: Optional[str] = None
    distributors: List[Distributor] = Field(default_factory=list, description='List of confirmed regional distributors, broad-line suppliers, or wholesalers')
    notes: Optional[str] = None
    research_metrics: Optional[ResearchRunMetrics] = None


class ColdOutreachTargetRequest(BaseModel):
    city: str
    state: str
    radius_km: float = Field(gt=0, le=300, description='Search radius in kilometers around the city center')
    ideal_customer_profile: Optional[str] = Field(
        default=None,
        description='Optional description of your ideal target so ranking is based on fit instead of generic business popularity',
    )
    target_categories: List[str] = Field(
        default_factory=list,
        description='Optional business categories or verticals to prioritize, for example gyms, cafes, dentists, or grocery stores',
    )
    exclude_categories: List[str] = Field(
        default_factory=list,
        description='Optional categories to avoid including in the results',
    )
    max_results: int = Field(default=15, ge=1, le=50)


class ColdOutreachTarget(BaseModel):
    name: str
    category: Optional[str] = None
    website: Optional[str] = None
    contact_page: Optional[str] = None
    email: Optional[str] = None
    email_unavailable_reason: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    country: str = 'USA'
    distance_km: Optional[float] = Field(default=None, ge=0)
    potential_score: int = Field(ge=0, le=100)
    ranking_reason: str
    source_urls: List[str] = Field(default_factory=list)


class ColdOutreachTargetResponse(BaseModel):
    city: str
    state: str
    radius_km: float
    ideal_customer_profile: Optional[str] = None
    target_categories: List[str] = Field(default_factory=list)
    total_targets: int
    targets: List[ColdOutreachTarget] = Field(default_factory=list)
    notes: Optional[str] = None
    research_metrics: Optional[ResearchRunMetrics] = None


class BrandEmailDraftPreview(BaseModel):
    brand_id: str
    brand_name: str
    to_email: str
    email_type: str
    subject: str
    body: str


class BrandEmailSendRequest(BaseModel):
    to_email: str
    subject: str
    body: str


class DistributorOutreachDraftItem(BaseModel):
    distributor_name: str
    to_email: Optional[str] = None
    subject: str
    body: str
    status: str = 'ready'
    reason: Optional[str] = None


class DistributorOutreachDraftPreview(BaseModel):
    brand_id: str
    brand_name: str
    total_targets: int
    ready_targets: int
    missing_email_targets: int
    already_sent_targets: int = 0
    drafts: List[DistributorOutreachDraftItem] = Field(default_factory=list)


class DistributorOutreachApproveRequest(BaseModel):
    drafts: List[DistributorOutreachDraftItem] = Field(default_factory=list)


class SMTPSettingsUpdateRequest(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = Field(default=None, ge=1, le=65535)
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    smtp_use_ssl: Optional[bool] = None
    clear_password: bool = False


class SMTPSettingsResponse(BaseModel):
    smtp_host: str = ''
    smtp_port: int = 587
    smtp_username: str = ''
    smtp_from_email: str = ''
    smtp_from_name: str = ''
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    has_password: bool = False
    password_source: str = 'unset'
    updated_at: Optional[str] = None


class EmailTemplateBlock(BaseModel):
    subject: str
    body: str


class EmailTemplatesResponse(BaseModel):
    brand_with_distributors: EmailTemplateBlock
    brand_without_distributors: EmailTemplateBlock
    distributor_outreach: EmailTemplateBlock
    updated_at: Optional[str] = None


class EmailTemplatesUpdateRequest(BaseModel):
    brand_with_distributors: EmailTemplateBlock
    brand_without_distributors: EmailTemplateBlock
    distributor_outreach: EmailTemplateBlock


class DistributorOutreachCampaignResponse(BaseModel):
    campaign_id: str
    brand_id: str
    brand_name: str
    status: str
    queued_targets: int
    skipped_targets: int
    total_targets: int


class DistributorOutreachTargetStatus(BaseModel):
    target_id: str
    distributor_name: str
    email: Optional[str] = None
    status: str
    attempt_count: int = 0
    last_error: Optional[str] = None
    scheduled_for: Optional[str] = None
    sent_at: Optional[str] = None


class DistributorOutreachCampaignDetail(BaseModel):
    campaign_id: str
    brand_id: str
    brand_name: str
    status: str
    total_targets: int
    queued_targets: int
    sent_targets: int
    failed_targets: int
    skipped_targets: int
    created_at: str
    updated_at: Optional[str] = None
    targets: List[DistributorOutreachTargetStatus] = Field(default_factory=list)
