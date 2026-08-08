import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  Check,
  ChevronDown,
  Filter,
  Loader,
  Mail,
  Pencil,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import Pagination from './Pagination';

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 30, 50];

const FILTER_OPTIONS = [
  { value: 'all', label: 'All brands', helper: 'Every active brand record' },
  { value: 'processed', label: 'Processed', helper: 'Completed research records' },
  { value: 'unprocessed', label: 'Not processed', helper: 'Brands waiting for research or retry' },
  { value: 'distributors', label: 'Has distributors', helper: 'Brands with distributor matches' },
  { value: 'emails', label: 'Has email', helper: 'Brands with a usable email found' },
  { value: 'sent', label: 'Email sent', helper: 'Brand outreach already sent' },
  { value: 'pending', label: 'Needs outreach', helper: 'Processed brands with email but no sent brand email' },
];

const RESEARCH_MODE_LABELS = {
  short: 'Short research',
  detailed: 'Detailed research',
};

const RESEARCH_MODE_OPTIONS = [
  {
    value: 'short',
    label: 'Short research',
    helper: 'Faster single-pass research for quick coverage.',
  },
  {
    value: 'detailed',
    label: 'Detailed research',
    helper: 'Staged research for stronger distributor and contact depth.',
  },
];

function Brands({ apiUrl }) {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalBrands, setTotalBrands] = useState(0);
  const [manualBrand, setManualBrand] = useState('');
  const [manualCountry, setManualCountry] = useState('USA');
  const [manualProductContext, setManualProductContext] = useState('');
  const [manualResearchMode, setManualResearchMode] = useState('short');
  const [addingBrand, setAddingBrand] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [processingAll, setProcessingAll] = useState(false);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancellingAll, setCancellingAll] = useState(false);
  const [bulkResearchMode, setBulkResearchMode] = useState('short');
  const [rowResearchModes, setRowResearchModes] = useState({});
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [emailingBrands, setEmailingBrands] = useState({});
  const [queueingCampaigns, setQueueingCampaigns] = useState({});
  const [campaignDetails, setCampaignDetails] = useState({});
  const [toast, setToast] = useState(null);
  const [deletingBrands, setDeletingBrands] = useState({});
  const [editorState, setEditorState] = useState({
    open: false,
    saving: false,
    error: null,
    brandId: null,
    form: null,
  });
  const [composerState, setComposerState] = useState({
    open: false,
    type: null,
    loading: false,
    saving: false,
    error: null,
    brandId: null,
    brandName: '',
    draft: null,
    selectedDraftIndex: 0,
  });
  const [stats, setStats] = useState({
    total: 0,
    total_records: 0,
    unprocessed: 0,
    queued: 0,
    running: 0,
    failed: 0,
    distributors_found: 0,
    emails_found: 0,
    email_sent: 0,
    pending_emails: 0,
  });
  const [confirmDelete, setConfirmDelete] = useState({ open: false, brand: null });
  const filterMenuRef = useRef(null);

  const apiBase = apiUrl.replace(/\/$/, '');

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setCurrentPage(1);
      setSearch(searchInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(event.target)) {
        setIsFilterMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalBrands / pageSize));
  const activeFilterMeta = FILTER_OPTIONS.find((option) => option.value === filter) || FILTER_OPTIONS[0];

  const buildBrandQuery = () => {
    const params = new URLSearchParams();
    params.set('skip', String((currentPage - 1) * pageSize));
    params.set('limit', String(pageSize));
    if (search) params.set('q', search);
    if (filter === 'processed') params.set('processed', 'true');
    if (filter === 'unprocessed') params.set('processed', 'false');
    if (filter === 'distributors') params.set('distributors_found', 'true');
    if (filter === 'emails') params.set('emails_found', 'true');
    if (filter === 'sent') params.set('email_sent', 'true');
    if (filter === 'pending') {
      params.set('processed', 'true');
      params.set('emails_found', 'true');
      params.set('email_sent', 'false');
    }
    return params.toString();
  };

  const saveBrands = async (items) => {
    const res = await fetch(`${apiBase}/brands/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brands: items }),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP ${res.status}`);
    }
    return res.json();
  };

  const getBrandResearchMode = (brand) => rowResearchModes[brand._id || brand.id] || brand.processing_research_mode || 'short';

  const getProcessingState = (brand) => {
    const status = brand.processing_status || 'idle';
    if (status === 'queued') {
      return { label: 'Queued', tone: 'blue', actionable: false, stoppable: true };
    }
    if (status === 'running') {
      return { label: 'Running', tone: 'amber', actionable: false, stoppable: true };
    }
    if (status === 'cancelling') {
      return { label: 'Stopping', tone: 'amber', actionable: false, stoppable: false };
    }
    if (status === 'cancelled') {
      return { label: 'Stopped', tone: 'gray', actionable: true, stoppable: false };
    }
    if (status === 'failed') {
      return { label: 'Failed', tone: 'red', actionable: true, stoppable: false };
    }
    if (brand.processed) {
      return { label: 'Processed', tone: 'green', actionable: true, stoppable: false };
    }

    return { label: 'Pending', tone: 'gray', actionable: true, stoppable: false };
  };

  const updateBrandLocallyById = (brandId, updater) => {
    setBrands((prevBrands) =>
      prevBrands.map((brand) => {
        const currentId = brand._id || brand.id;
        return currentId === brandId ? updater(brand) : brand;
      }),
    );
    setSelectedBrand((prevBrand) => {
      if (!prevBrand) return prevBrand;
      const currentId = prevBrand._id || prevBrand.id;
      return currentId === brandId ? updater(prevBrand) : prevBrand;
    });
  };


  const brandMatchesCurrentView = (brand) => {
    const normalizedSearch = search.trim().toLowerCase();
    const searchable = [
      brand.brand,
      brand.country,
      brand.parent_company,
      brand.product_context,
    ].filter(Boolean).join(' ').toLowerCase();

    if (normalizedSearch && !searchable.includes(normalizedSearch)) return false;
    if (filter === 'processed') return !!brand.processed;
    if (filter === 'unprocessed') return !brand.processed;
    if (filter === 'distributors') return !!brand.distributors_found;
    if (filter === 'emails') return !!brand.emails_found;
    if (filter === 'sent') return !!brand.email_sent;
    if (filter === 'pending') return !!brand.processed && !!brand.emails_found && !brand.email_sent;
    return true;
  };

  const addBrandLocally = (brand) => {
    const brandId = brand._id || brand.id;
    if (!brandId) return;

    setRowResearchModes((prev) => ({
      ...prev,
      [brandId]: brand.processing_research_mode || brand.research_mode || 'short',
    }));

    setStats((prev) => ({
      ...prev,
      total_records: prev.total_records + 1,
      unprocessed: prev.unprocessed + (brand.processed ? 0 : 1),
      queued: prev.queued + (['queued', 'cancelling'].includes(brand.processing_status) ? 1 : 0),
      running: prev.running + (brand.processing_status === 'running' ? 1 : 0),
      failed: prev.failed + (brand.processing_status === 'failed' ? 1 : 0),
      distributors_found: prev.distributors_found + (brand.distributors_found ? 1 : 0),
      emails_found: prev.emails_found + (brand.emails_found ? 1 : 0),
      email_sent: prev.email_sent + (brand.email_sent ? 1 : 0),
      pending_emails: prev.pending_emails + (brand.processed && brand.emails_found && !brand.email_sent ? 1 : 0),
      total: prev.total + (brand.processed ? 1 : 0),
    }));

    if (!brandMatchesCurrentView(brand)) return;

    setTotalBrands((prev) => prev + 1);
    if (currentPage !== 1) return;

    setBrands((prevBrands) => {
      if (prevBrands.some((item) => (item._id || item.id) === brandId)) return prevBrands;
      return [brand, ...prevBrands].slice(0, pageSize);
    });
  };

  const syncBrandsSilently = () => {
    window.setTimeout(() => {
      loadData({ silent: true });
    }, 1200);
  };

  const handleManualAdd = async () => {
    const trimmedBrand = manualBrand.trim();
    const trimmedCountry = manualCountry.trim() || 'USA';
    const trimmedProductContext = manualProductContext.trim();
    if (!trimmedBrand) {
      showToast('Please enter a brand name.', 'error');
      return;
    }

    setAddingBrand(true);
    try {
      const result = await saveBrands([{
        brand: trimmedBrand,
        country: trimmedCountry,
        product_context: trimmedProductContext || null,
        research_mode: manualResearchMode,
      }]);

      if (result.inserted > 0) {
        const createdBrand = result.items?.[0];
        if (createdBrand) {
          addBrandLocally(createdBrand);
        }
        showToast(`Added "${trimmedBrand}".`);

        setManualBrand('');
        setManualCountry('USA');
        setManualProductContext('');
        setManualResearchMode('short');
      } else {
        showToast(`"${trimmedBrand}" already exists.`, 'error');
      }
    } catch (err) {
      showToast('Brand add failed: ' + err.message, 'error');
    } finally {
      setAddingBrand(false);
    }
  };

  const handleProcessBrand = async (brand) => {
    const brandId = brand._id || brand.id;
    const selectedMode = getBrandResearchMode(brand);
    setProcessingId(brandId);
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ research_mode: selectedMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      updateBrandLocallyById(brandId, (current) => ({
        ...current,
        processing_status: 'queued',
        processing_research_mode: selectedMode,
        processing_error: null,
      }));
      showToast(data.message || `Queued "${brand.brand}".`);
      syncBrandsSilently();
    } catch (err) {
      showToast('Failed to queue brand: ' + err.message, 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleProcessAll = async () => {
    const actionable = brands.filter((brand) => {
      const status = brand.processing_status || (brand.processed ? 'completed' : 'idle');
      return !brand.processed && !['queued', 'running', 'cancelling'].includes(status);
    });

    if (actionable.length === 0) {
      showToast('There are no visible brands ready to queue.', 'error');
      return;
    }

    setProcessingAll(true);
    try {
      const brandIds = actionable.map((brand) => brand._id || brand.id);
      const res = await fetch(`${apiBase}/brands/trigger-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_ids: brandIds, research_mode: bulkResearchMode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      actionable.forEach((brand) => {
        const brandId = brand._id || brand.id;
        updateBrandLocallyById(brandId, (current) => ({
          ...current,
          processing_status: 'queued',
          processing_research_mode: bulkResearchMode,
          processing_error: null,
        }));
      });
      showToast(data.message || `Queued ${data.queued_count || 0} brand(s).`);
      syncBrandsSilently();
    } catch (err) {
      showToast('Bulk queue failed: ' + err.message, 'error');
    } finally {
      setProcessingAll(false);
    }
  };

  const handleCancelBrand = async (brand) => {
    const brandId = brand._id || brand.id;
    setCancellingId(brandId);
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      updateBrandLocallyById(brandId, (current) => ({
        ...current,
        processing_status: 'cancelling',
      }));
      showToast(data.message || `Stop requested for "${brand.brand}".`);
      syncBrandsSilently();
    } catch (err) {
      showToast('Stop failed: ' + err.message, 'error');
    } finally {
      setCancellingId(null);
    }
  };

  const handleCancelAll = async () => {
    const activeBrands = brands.filter((brand) => ['queued', 'running', 'cancelling'].includes(brand.processing_status || 'idle'));
    if (activeBrands.length === 0) {
      showToast('There are no visible brands currently running or queued.', 'error');
      return;
    }

    setCancellingAll(true);
    try {
      const brandIds = activeBrands.map((brand) => brand._id || brand.id);
      const res = await fetch(`${apiBase}/brands/cancel-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand_ids: brandIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }
      activeBrands.forEach((brand) => {
        const brandId = brand._id || brand.id;
        updateBrandLocallyById(brandId, (current) => ({
          ...current,
          processing_status: 'cancelling',
        }));
      });
      showToast(data.message || 'Stop request submitted.');
      syncBrandsSilently();
    } catch (err) {
      showToast('Stop all failed: ' + err.message, 'error');
    } finally {
      setCancellingAll(false);
    }
  };

  const loadCampaignDetail = async (campaignId, brandId) => {
    try {
      const res = await fetch(`${apiBase}/distributor-outreach-campaigns/${campaignId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load campaign');
      setCampaignDetails((prev) => ({ ...prev, [brandId]: data }));
    } catch (err) {
      console.error(err);
    }
  };

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const query = buildBrandQuery();
      const [brandsRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/brands?${query}`),
        fetch(`${apiBase}/brands/stats`),
      ]);

      if (!brandsRes.ok || !statsRes.ok) {
        throw new Error('API Error');
      }

      const brandsPayload = await brandsRes.json();
      const statsData = await statsRes.json();
      const items = brandsPayload.items || [];

      setBrands(items);
      setRowResearchModes((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          const id = item._id || item.id;
          if (id && !next[id]) {
            next[id] = item.processing_research_mode || 'short';
          }
        });
        return next;
      });
      setTotalBrands(brandsPayload.total ?? items.length);
      setStats({
        total: statsData.total ?? items.length,
        total_records: statsData.total_records ?? items.length,
        unprocessed: statsData.unprocessed ?? 0,
        queued: statsData.queued ?? 0,
        running: statsData.running ?? 0,
        failed: statsData.failed ?? 0,
        distributors_found: statsData.distributors_found ?? 0,
        emails_found: statsData.emails_found ?? 0,
        email_sent: statsData.email_sent ?? 0,
        pending_emails: statsData.pending_emails ?? 0,
      });

      if (selectedBrand) {
        const updatedSelectedBrand = items.find(
          (item) => (item._id || item.id) === (selectedBrand._id || selectedBrand.id),
        );
        if (updatedSelectedBrand) {
          setSelectedBrand(updatedSelectedBrand);
        }
      }
    } catch (err) {
      console.error(err);
      if (!silent) {
        setError('Failed to connect to API: ' + err.message);
      }
    }
    if (!silent) {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [apiUrl, filter, currentPage, search, pageSize]);

  useEffect(() => {
    const campaignId = selectedBrand?.latest_distributor_outreach?.campaign_id;
    const brandId = selectedBrand?._id || selectedBrand?.id;
    if (campaignId && brandId) {
      loadCampaignDetail(campaignId, brandId);
    }
  }, [selectedBrand]);

  const handleSendEmail = async (brandId) => {
    setEmailingBrands((prev) => ({ ...prev, [brandId]: true }));
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/send-email`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to send email');
      }

      const sentAt = new Date().toISOString();

      setBrands((prevBrands) =>
        prevBrands.map((brand) => {
          const currentId = brand._id || brand.id;
          if (currentId !== brandId) return brand;
          return {
            ...brand,
            email_sent: true,
            email_sent_at: sentAt,
          };
        }),
      );

      setSelectedBrand((prevBrand) => {
        if (!prevBrand) return prevBrand;
        const currentId = prevBrand._id || prevBrand.id;
        if (currentId !== brandId) return prevBrand;
        return {
          ...prevBrand,
          email_sent: true,
          email_sent_at: sentAt,
        };
      });

      setStats((prev) => ({
        ...prev,
        email_sent: prev.email_sent + 1,
        pending_emails: Math.max(0, prev.pending_emails - 1),
      }));

      showToast('Email queued successfully.');
    } catch (err) {
      console.error(err);
      showToast('Email send failed: ' + err.message, 'error');
    } finally {
      setEmailingBrands((prev) => ({ ...prev, [brandId]: false }));
    }
  };

  const handleQueueDistributorOutreach = async (brand) => {
    const brandId = brand._id || brand.id;
    setQueueingCampaigns((prev) => ({ ...prev, [brandId]: true }));
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/distributor-outreach`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to queue distributor outreach');
      }

      const latestCampaign = {
        campaign_id: data.campaign_id,
        status: data.status,
        queued_targets: data.queued_targets,
        sent_targets: 0,
        failed_targets: 0,
        skipped_targets: data.skipped_targets,
        total_targets: data.total_targets,
      };

      setBrands((prevBrands) => prevBrands.map((item) => {
        const currentId = item._id || item.id;
        if (currentId !== brandId) return item;
        return {
          ...item,
          latest_distributor_outreach: latestCampaign,
          distributor_outreach_status: data.status,
        };
      }));

      setSelectedBrand((prevBrand) => {
        if (!prevBrand) return prevBrand;
        const currentId = prevBrand._id || prevBrand.id;
        if (currentId !== brandId) return prevBrand;
        return {
          ...prevBrand,
          latest_distributor_outreach: latestCampaign,
          distributor_outreach_status: data.status,
        };
      });

      await loadCampaignDetail(data.campaign_id, brandId);
      showToast(`Queued distributor outreach for ${data.queued_targets} distributor(s). ${data.skipped_targets} skipped.`);
    } catch (err) {
      console.error(err);
      showToast('Distributor outreach failed: ' + err.message, 'error');
    } finally {
      setQueueingCampaigns((prev) => ({ ...prev, [brandId]: false }));
    }
  };

  const updateBrandLocally = (brandId, updater) => {
    setBrands((prevBrands) =>
      prevBrands.map((brand) => {
        const currentId = brand._id || brand.id;
        return currentId === brandId ? updater(brand) : brand;
      }),
    );
    setSelectedBrand((prevBrand) => {
      if (!prevBrand) return prevBrand;
      const currentId = prevBrand._id || prevBrand.id;
      return currentId === brandId ? updater(prevBrand) : prevBrand;
    });
  };

  const buildEditForm = (brand) => ({
    brand: brand.brand || '',
    country: brand.country || 'USA',
    product_context: brand.product_context || '',
    parent_company: brand.parent_company || '',
    official_website: brand.official_website || '',
    brand_address: brand.brand_address || '',
    brand_postal_code: brand.brand_postal_code || '',
    brand_contact_page: brand.brand_contact_page || '',
    parent_company_contact_page: brand.parent_company_contact_page || '',
    brand_phone: brand.brand_phone || '',
    parent_company_phone: brand.parent_company_phone || '',
    brand_emails_text: ((brand.all_brand_emails || brand.brand_emails || []).filter(Boolean)).join('\n'),
    brand_email_unavailable_reason: brand.brand_email_unavailable_reason || '',
    parent_company_email: brand.parent_company_email || '',
    parent_company_email_type: brand.parent_company_email_type || '',
    parent_company_email_unavailable_reason: brand.parent_company_email_unavailable_reason || '',
    distributors: (brand.distributors || []).map((dist) => ({
      name: dist.name || '',
      website: dist.website || '',
      address: dist.address || '',
      city: dist.city || '',
      state: dist.state || '',
      postal_code: dist.postal_code || '',
      country: dist.country || '',
      email: dist.email || '',
      phone: dist.phone || '',
      contact_page: dist.contact_page || '',
      email_unavailable_reason: dist.email_unavailable_reason || '',
      official: !!dist.official,
      source: dist.source || '',
      confidence: Number.isFinite(dist.confidence) ? dist.confidence : 50,
    })),
  });

  const getOutreachPresentation = (brand, campaign = null) => {
    const brandSent = !!brand?.email_sent;
    const distributorStatus =
      campaign?.status ||
      brand?.latest_distributor_outreach?.status ||
      brand?.distributor_outreach_status ||
      null;
    const distributorSent =
      campaign?.sent_targets ?? brand?.latest_distributor_outreach?.sent_targets ?? 0;

    if (brandSent && distributorSent > 0) {
      return { label: 'Brand + Dist', tone: 'purple' };
    }
    if (distributorSent > 0 || distributorStatus === 'completed' || distributorStatus === 'completed_with_errors') {
      return { label: 'Dist Sent', tone: 'purple' };
    }
    if (brandSent) {
      return { label: 'Brand Sent', tone: 'purple' };
    }
    if (distributorStatus === 'queued') {
      return { label: 'Dist Queued', tone: 'amber' };
    }
    if (distributorStatus === 'running') {
      return { label: 'Dist Running', tone: 'amber' };
    }
    if (distributorStatus === 'failed') {
      return { label: 'Dist Failed', tone: 'red' };
    }
    return { label: 'Pending', tone: 'gray' };
  };

  const openEditBrand = (brand) => {
    setEditorState({
      open: true,
      saving: false,
      error: null,
      brandId: brand._id || brand.id,
      form: buildEditForm(brand),
    });
  };

  const closeEditor = () => {
    setEditorState({ open: false, saving: false, error: null, brandId: null, form: null });
  };

  const updateEditorField = (field, value) => {
    setEditorState((prev) => ({
      ...prev,
      form: prev.form ? { ...prev.form, [field]: value } : prev.form,
    }));
  };

  const updateEditorDistributorField = (index, field, value) => {
    setEditorState((prev) => {
      if (!prev.form) return prev;
      const distributors = prev.form.distributors.map((item, distributorIndex) => (
        distributorIndex === index ? { ...item, [field]: value } : item
      ));
      return { ...prev, form: { ...prev.form, distributors } };
    });
  };

  const addDistributorRow = () => {
    setEditorState((prev) => {
      if (!prev.form) return prev;
      return {
        ...prev,
        form: {
          ...prev.form,
          distributors: [
            ...prev.form.distributors,
            {
              name: '', website: '', address: '', city: '', state: '', postal_code: '', country: '', email: '', phone: '', contact_page: '', official: false, source: '', confidence: 50,
            },
          ],
        },
      };
    });
  };

  const removeDistributorRow = (index) => {
    setEditorState((prev) => {
      if (!prev.form) return prev;
      return {
        ...prev,
        form: {
          ...prev.form,
          distributors: prev.form.distributors.filter((_, distributorIndex) => distributorIndex !== index),
        },
      };
    });
  };

  const saveEditedBrand = async () => {
    if (!editorState.form || !editorState.brandId) return;
    setEditorState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const payload = {
        brand: editorState.form.brand.trim(),
        country: editorState.form.country.trim() || 'USA',
        product_context: editorState.form.product_context.trim() || null,
        parent_company: editorState.form.parent_company.trim() || null,
        official_website: editorState.form.official_website.trim() || null,
        brand_address: editorState.form.brand_address.trim() || null,
        brand_postal_code: editorState.form.brand_postal_code.trim() || null,
        brand_contact_page: editorState.form.brand_contact_page.trim() || null,
        parent_company_contact_page: editorState.form.parent_company_contact_page.trim() || null,
        brand_phone: editorState.form.brand_phone.trim() || null,
        parent_company_phone: editorState.form.parent_company_phone.trim() || null,
        brand_emails: editorState.form.brand_emails_text
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        brand_email_unavailable_reason: editorState.form.brand_email_unavailable_reason.trim() || null,
        parent_company_email: editorState.form.parent_company_email.trim() || null,
        parent_company_email_type: editorState.form.parent_company_email_type.trim() || null,
        parent_company_email_unavailable_reason: editorState.form.parent_company_email_unavailable_reason.trim() || null,
        distributors: editorState.form.distributors
          .map((dist) => ({
            ...dist,
            name: dist.name.trim(),
            website: dist.website.trim() || null,
            address: dist.address.trim() || null,
            city: dist.city.trim() || null,
            state: dist.state.trim() || null,
            postal_code: dist.postal_code.trim() || null,
            country: dist.country.trim() || null,
            email: dist.email.trim() || null,
            phone: dist.phone.trim() || null,
            contact_page: dist.contact_page.trim() || null,
            email_unavailable_reason: dist.email_unavailable_reason.trim() || null,
            source: dist.source.trim() || null,
            confidence: Number(dist.confidence) || 0,
          }))
          .filter((dist) => dist.name),
      };
      const res = await fetch(`${apiBase}/brands/${editorState.brandId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to save brand details');
      updateBrandLocally(editorState.brandId, () => data);
      showToast(`Saved updates for ${data.brand}.`);
      closeEditor();
    } catch (err) {
      setEditorState((prev) => ({ ...prev, saving: false, error: err.message }));
    }
  };

  const requestDeleteProcessedBrand = (brand) => {
    setConfirmDelete({ open: true, brand });
  };

  const closeDeleteDialog = () => {
    setConfirmDelete({ open: false, brand: null });
  };

  const deleteProcessedBrand = async (brand) => {
    const brandId = brand._id || brand.id;
    setDeletingBrands((prev) => ({ ...prev, [brandId]: true }));
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to delete brand');
      setBrands((prev) => prev.filter((item) => (item._id || item.id) !== brandId));
      setTotalBrands((prev) => Math.max(0, prev - 1));
      if ((selectedBrand?._id || selectedBrand?.id) === brandId) {
        setSelectedBrand(null);
      }
      showToast(`Deleted ${brand.brand}.`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDeletingBrands((prev) => ({ ...prev, [brandId]: false }));
      closeDeleteDialog();
    }
  };

  const closeComposer = () => {
    setComposerState({
      open: false,
      type: null,
      loading: false,
      saving: false,
      error: null,
      brandId: null,
      brandName: '',
      draft: null,
      selectedDraftIndex: 0,
    });
  };

  const openBrandEmailComposer = async (brand) => {
    const brandId = brand._id || brand.id;
    setComposerState({
      open: true,
      type: 'brand',
      loading: true,
      saving: false,
      error: null,
      brandId,
      brandName: brand.brand,
      draft: null,
      selectedDraftIndex: 0,
    });
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/email-draft`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load email draft');
      setComposerState((prev) => ({ ...prev, loading: false, draft: data }));
    } catch (err) {
      setComposerState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const openDistributorComposer = async (brand) => {
    const brandId = brand._id || brand.id;
    setComposerState({
      open: true,
      type: 'distributors',
      loading: true,
      saving: false,
      error: null,
      brandId,
      brandName: brand.brand,
      draft: null,
      selectedDraftIndex: 0,
    });
    try {
      const res = await fetch(`${apiBase}/brands/${brandId}/distributor-outreach-draft`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to load distributor drafts');
      const hydratedDrafts = (data.drafts || []).map((item) => ({
        ...item,
        selected: item.status === 'ready',
      }));
      const firstEditableIndex = hydratedDrafts.findIndex((item) => item.status === 'ready');
      setComposerState((prev) => ({
        ...prev,
        loading: false,
        draft: { ...data, drafts: hydratedDrafts },
        selectedDraftIndex: firstEditableIndex >= 0 ? firstEditableIndex : 0,
      }));
    } catch (err) {
      setComposerState((prev) => ({ ...prev, loading: false, error: err.message }));
    }
  };

  const updateBrandDraftField = (field, value) => {
    setComposerState((prev) => ({
      ...prev,
      draft: prev.draft ? { ...prev.draft, [field]: value } : prev.draft,
    }));
  };

  const updateDistributorDraftField = (index, field, value) => {
    setComposerState((prev) => {
      if (!prev.draft?.drafts) return prev;
      const drafts = prev.draft.drafts.map((item, draftIndex) => (
        draftIndex === index ? { ...item, [field]: value } : item
      ));
      return {
        ...prev,
        draft: { ...prev.draft, drafts },
      };
    });
  };


  const toggleDistributorDraftSelection = (index) => {
    setComposerState((prev) => {
      if (!prev.draft?.drafts) return prev;
      const target = prev.draft.drafts[index];
      if (!target || target.status !== 'ready') return prev;
      const drafts = prev.draft.drafts.map((item, draftIndex) => (
        draftIndex === index ? { ...item, selected: !item.selected } : item
      ));
      return {
        ...prev,
        draft: { ...prev.draft, drafts },
      };
    });
  };

  const setAllDistributorDraftSelections = (selected) => {
    setComposerState((prev) => {
      if (!prev.draft?.drafts) return prev;
      const drafts = prev.draft.drafts.map((item) => (
        item.status === 'ready' ? { ...item, selected } : item
      ));
      return {
        ...prev,
        draft: { ...prev.draft, drafts },
      };
    });
  };

  const approveBrandEmail = async () => {
    if (!composerState.draft || !composerState.brandId) return;
    setComposerState((prev) => ({ ...prev, saving: true, error: null }));
    setEmailingBrands((prev) => ({ ...prev, [composerState.brandId]: true }));
    try {
      const res = await fetch(`${apiBase}/brands/${composerState.brandId}/send-email-approved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_email: composerState.draft.to_email,
          subject: composerState.draft.subject,
          body: composerState.draft.body,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to send email');

      const sentAt = new Date().toISOString();
      updateBrandLocally(composerState.brandId, (brand) => ({
        ...brand,
        email_sent: true,
        email_sent_at: sentAt,
        email_sent_to: composerState.draft.to_email,
        email_subject: composerState.draft.subject,
        email_body: composerState.draft.body,
      }));
      setStats((prev) => ({
        ...prev,
        email_sent: prev.email_sent + 1,
        pending_emails: Math.max(0, prev.pending_emails - 1),
      }));
      showToast(`Email sent to ${composerState.draft.to_email}.`);
      closeComposer();
    } catch (err) {
      setComposerState((prev) => ({ ...prev, saving: false, error: err.message }));
    } finally {
      setEmailingBrands((prev) => ({ ...prev, [composerState.brandId]: false }));
    }
  };

  const approveDistributorOutreach = async () => {
    if (!composerState.draft || !composerState.brandId) return;
    const selectedDrafts = composerState.draft.drafts.filter((draft) => draft.status === 'ready' && draft.selected);
    if (!selectedDrafts.length) {
      setComposerState((prev) => ({ ...prev, error: 'Select at least one ready distributor email before approving the campaign.' }));
      return;
    }
    setComposerState((prev) => ({ ...prev, saving: true, error: null }));
    setQueueingCampaigns((prev) => ({ ...prev, [composerState.brandId]: true }));
    try {
      const res = await fetch(`${apiBase}/brands/${composerState.brandId}/distributor-outreach-approved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drafts: selectedDrafts.map(({ selected, ...draft }) => draft) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || 'Failed to queue distributor outreach');

      const latestCampaign = {
        campaign_id: data.campaign_id,
        status: data.status,
        queued_targets: data.queued_targets,
        sent_targets: 0,
        failed_targets: 0,
        skipped_targets: data.skipped_targets,
        total_targets: data.total_targets,
      };

      updateBrandLocally(composerState.brandId, (brand) => ({
        ...brand,
        latest_distributor_outreach: latestCampaign,
        distributor_outreach_status: data.status,
      }));
      await loadCampaignDetail(data.campaign_id, composerState.brandId);
      showToast(`Queued ${data.queued_targets} distributor emails. ${data.skipped_targets} draft(s) were skipped.`);
      closeComposer();
    } catch (err) {
      setComposerState((prev) => ({ ...prev, saving: false, error: err.message }));
    } finally {
      setQueueingCampaigns((prev) => ({ ...prev, [composerState.brandId]: false }));
    }
  };

  const selectedBrandPrimaryEmail = useMemo(() => {
    if (!selectedBrand) return null;
    return selectedBrand.brand_email || selectedBrand.parent_company_email || null;
  }, [selectedBrand]);

  const selectedBrandId = selectedBrand?._id || selectedBrand?.id;
  const selectedCampaign = selectedBrandId ? campaignDetails[selectedBrandId] : null;
  const selectedOutreachStatus =
    selectedCampaign?.status ||
    selectedBrand?.latest_distributor_outreach?.status ||
    selectedBrand?.distributor_outreach_status ||
    null;
  const sentDistributorTargets =
    selectedCampaign?.sent_targets ?? selectedBrand?.latest_distributor_outreach?.sent_targets ?? 0;
  const hasActiveDistributorOutreach =
    selectedOutreachStatus === 'queued' || selectedOutreachStatus === 'running';
  const selectedBrandDistributorEmailCount = useMemo(
    () => (selectedBrand?.distributors || []).filter((dist) => dist.email).length,
    [selectedBrand],
  );
  const remainingDistributorEmailCount = Math.max(selectedBrandDistributorEmailCount - sentDistributorTargets, 0);
  const hasSentDistributorOutreach = sentDistributorTargets > 0;
  const allDistributorEmailsAlreadySent =
    selectedBrandDistributorEmailCount > 0 && remainingDistributorEmailCount === 0;
  const selectedDistributorDraft =
    composerState.type === 'distributors' && composerState.draft?.drafts?.length
      ? composerState.draft.drafts[composerState.selectedDraftIndex] || null
      : null;
  const pageStates = brands.map(getProcessingState);
  const pendingQueueCount = pageStates.filter((state) => ['Pending', 'Failed', 'Stopped'].includes(state.label)).length;
  const activeQueueCount = pageStates.filter((state) => ['Queued', 'Running', 'Stopping'].includes(state.label)).length;
  const selectedBulkModeMeta = RESEARCH_MODE_OPTIONS.find((option) => option.value === bulkResearchMode);
  const distributorDraftSelectionSummary = useMemo(() => {
    const drafts = composerState.draft?.drafts || [];
    const readyDrafts = drafts.filter((draft) => draft.status === 'ready');
    const selectedReadyDrafts = readyDrafts.filter((draft) => draft.selected);
    return {
      readyCount: readyDrafts.length,
      selectedCount: selectedReadyDrafts.length,
    };
  }, [composerState.draft]);

  const compactDetails = selectedBrand
    ? [
        {
          title: 'Contact details',
          icon: Phone,
          items: [
            {
              label: 'Official website',
              value: selectedBrand.official_website,
              href: selectedBrand.official_website,
            },
            {
              label: 'Brand contact page',
              value: selectedBrand.brand_contact_page,
              href: selectedBrand.brand_contact_page,
            },
            {
              label: 'Parent contact page',
              value: selectedBrand.parent_company_contact_page,
              href: selectedBrand.parent_company_contact_page,
            },
            {
              label: 'Primary email',
              value: selectedBrandPrimaryEmail,
              href: selectedBrandPrimaryEmail ? `mailto:${selectedBrandPrimaryEmail}` : null,
              note: !selectedBrandPrimaryEmail ? selectedBrand.brand_email_unavailable_reason || null : null,
            },
            {
              label: 'Brand address',
              value: selectedBrand.brand_address,
            },
            {
              label: 'Brand phone',
              value: selectedBrand.brand_phone,
              href: selectedBrand.brand_phone ? `tel:${selectedBrand.brand_phone}` : null,
            },
            {
              label: 'Parent company phone',
              value: selectedBrand.parent_company_phone,
              href: selectedBrand.parent_company_phone ? `tel:${selectedBrand.parent_company_phone}` : null,
            },
            {
              label: 'All brand emails',
              values: selectedBrand.all_brand_emails || selectedBrand.brand_emails || [],
              mailtoList: true,
            },
            {
              label: 'Parent company email',
              value: selectedBrand.parent_company_email,
              href: selectedBrand.parent_company_email
                ? `mailto:${selectedBrand.parent_company_email}`
                : null,
              note: !selectedBrand.parent_company_email ? selectedBrand.parent_company_email_unavailable_reason || null : null,
            },
          ],
        },
      ]
    : [];

  return (
    <div className="page-shell">
      {toast && (
        <div className={`toast-banner ${toast.type === 'error' ? 'error' : 'success'}`}>
          {toast.message}
        </div>
      )}

      {/* <section className="page-hero page-hero--compact brands-hero">
        <div>
          <span className="eyebrow">Brand operations</span>
          <h2 className="page-title">Manage research queue and results from one workspace</h2>
          <p className="page-subtitle">
            Add brands, set research mode, process or stop jobs, and review completed research without switching pages.
          </p>
        </div>
      </section> */}

      <div className="brands-top-grid">
        <div className="brands-left-panel">
          <div className="surface-card brands-ops-card brands-ops-card--compact">
            <div className="brands-card-heading">
              <h3>Research actions</h3>
              <span>Apply one mode to visible queue items.</span>
            </div>
            <div className="brands-ops-card__body brands-ops-card__body--compact">
              <div className="brands-ops-card__row brands-ops-card__row--compact">
                <select value={bulkResearchMode} onChange={(e) => setBulkResearchMode(e.target.value)} className="form-select brands-inline-select brands-inline-select--compact brands-ops-select">
                  {RESEARCH_MODE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {pendingQueueCount > 0 && (
                  <button type="button" onClick={handleProcessAll} className="btn-primary brands-ops-action brands-ops-action--compact" disabled={processingAll || cancellingAll}>
                    {processingAll ? <><Loader size={14} className="spin-inline" /> Queueing...</> : <><Play size={14} /> Process Visible</>}
                  </button>
                )}
              </div>
              {activeQueueCount > 0 && (
                <button type="button" onClick={handleCancelAll} className="btn-primary btn-secondary brands-ops-action brands-ops-action--ghost" disabled={processingAll || cancellingAll}>
                  {cancellingAll ? <><Loader size={14} className="spin-inline" /> Stopping...</> : <><Square size={14} /> Stop All</>}
                </button>
              )}
            </div>
          </div>

          <div className="surface-card brands-stats-card brands-stats-card--stacked">
            <div className="brands-card-heading brands-card-heading--stats">
              <h3>Queue overview</h3>
              <span>Live counts for this workspace.</span>
            </div>
            <div className="brands-stats-card__stack">
              <div className="brands-mini-stat active">
                <div className="stat-label">All Brands</div>
                <div className="stat-value blue">{stats.total_records || totalBrands}</div>
              </div>
              <div className="brands-mini-stat">
                <div className="stat-label">Processed</div>
                <div className="stat-value green">{stats.total}</div>
              </div>
              <div className="brands-mini-stat">
                <div className="stat-label">Not Processed</div>
                <div className="stat-value amber">{stats.unprocessed}</div>
              </div>
              <div className="brands-mini-stat">
                <div className="stat-label">Queued or Running</div>
                <div className="stat-value purple">{stats.queued + stats.running}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card brands-add-card brands-add-card--compact">
          <div className="brands-card-heading">
            <h3>Add brand</h3>
            <span>Save a new brand with its default research mode.</span>
          </div>
          <div className="brands-add-grid brands-add-grid--compact">
            <div className="brands-add-grid__brand-row">
              <input
                type="text"
                value={manualBrand}
                onChange={(e) => setManualBrand(e.target.value)}
                placeholder="Brand name"
                className="form-input brands-add-grid__brand"
              />
              <input
                type="text"
                value={manualProductContext}
                onChange={(e) => setManualProductContext(e.target.value)}
                placeholder="Reference product or category (optional)"
                className="form-input brands-add-grid__context"
              />
            </div>
            <div className="brands-add-grid__controls-row">
              <input
                type="text"
                value={manualCountry}
                onChange={(e) => setManualCountry(e.target.value)}
                placeholder="Country"
                className="form-input form-input--small brands-add-grid__country"
              />
              <select value={manualResearchMode} onChange={(e) => setManualResearchMode(e.target.value)} className="form-select brands-inline-select brands-inline-select--compact brands-add-grid__mode">
                {RESEARCH_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button className="btn-primary btn-success brands-add-grid__button" type="button" onClick={handleManualAdd} disabled={addingBrand}>
                {addingBrand ? <><Loader size={14} className="spin-inline" /> Saving...</> : <><Plus size={14} /> Add Brand</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card controls-card brands-filters-card brands-filters-card--table brands-filters-card--compact">
        <div className="toolbar brands-toolbar brands-toolbar--compact">
          <div className="search-wrap search-wide brands-toolbar__search">
            <Search className="search-icon" size={16} />
            <input
              className="search-input"
              type="text"
              placeholder="Search brand, country, parent company, or product context..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="brands-toolbar__controls">
            <div className="brands-filter-menu" ref={filterMenuRef}>
              <button
                type="button"
                className={`btn-primary btn-secondary brands-filter-trigger ${isFilterMenuOpen ? 'active' : ''}`}
                onClick={() => setIsFilterMenuOpen((prev) => !prev)}
                aria-expanded={isFilterMenuOpen}
              >
                <Filter size={14} />
                {activeFilterMeta.label}
                <ChevronDown size={14} />
              </button>
              {isFilterMenuOpen && (
                <div className="brands-filter-popover">
                  {FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`brands-filter-option ${filter === option.value ? 'active' : ''}`}
                      onClick={() => {
                        setFilter(option.value);
                        setIsFilterMenuOpen(false);
                      }}
                    >
                      <span>
                        <strong>{option.label}</strong>
                        <small>{option.helper}</small>
                      </span>
                      {filter === option.value && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" onClick={() => loadData()} className="btn-primary btn-secondary brands-filter-refresh brands-filter-refresh--inline" disabled={loading}>
              <RefreshCw size={14} className={loading ? 'spin-inline' : ''} />
              Refresh
            </button>
          </div>
        </div>
        <div className="results-meta results-meta--tight">
          <span>Showing {brands.length} of {totalBrands} brands</span>
          <span>{activeFilterMeta.label}</span>
        </div>
      </div>

      <div className="surface-card table-card">
        {loading && (
          <div className="empty-state empty-state--table">
            <div className="spinner spin-center"></div>
            <h3>Loading brands</h3>
            <p>Fetching brand queue and research records from the backend.</p>
          </div>
        )}

        {!loading && error && (
          <div className="empty-state empty-state--table">
            <AlertCircle size={48} />
            <h3>Connection Failed</h3>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && brands.length === 0 && (
          <div className="empty-state empty-state--table">
            <h3>No brands found</h3>
            <p>Try another search, switch the filter, or add a brand above.</p>
          </div>
        )}

        {!loading && !error && brands.length > 0 && (
          <div className="table-wrap">
            <table className="brands-table brands-table--workspace">
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>Country</th>
                  <th>Parent Company</th>
                  <th>Status</th>
                  <th>Research Type</th>
                  <th>Distributors</th>
                  <th>Email</th>
                  <th>Outreach</th>
                  <th>Updated</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {brands.map((brand, index) => {
                  const uId = brand._id || brand.id || index;
                  const distCount = brand.distributors?.length || 0;
                  const outreach = getOutreachPresentation(brand);
                  const state = getProcessingState(brand);
                  const isProcessing = processingId === uId;
                  const isCancelling = cancellingId === uId;
                  const selectedMode = getBrandResearchMode(brand);
                  const canStop = state.stoppable && !isProcessing && !isCancelling;
                  const canProcess = state.actionable && !isProcessing && !isCancelling;
                  return (
                    <tr key={uId} className="brands-table__row" onClick={() => setSelectedBrand(brand)}>
                      <td>
                        <div className="table-brand-cell">
                          <div className="brand-icon">{(brand.brand || 'B').slice(0, 2).toUpperCase()}</div>
                          <div>
                            <div className="table-brand-name">{brand.brand}</div>
                            <div className="table-brand-sub">{brand.product_context || 'Open details'}</div>
                          </div>
                        </div>
                      </td>
                      <td>{brand.country || 'USA'}</td>
                      <td>{brand.parent_company || 'Not found'}</td>
                      <td>
                        <div className="table-status-cell" onClick={(event) => event.stopPropagation()}>
                          <span className={`badge ${state.tone}`}>{state.label}</span>
                          {brand.processing_error && ['Failed', 'Stopped'].includes(state.label) && (
                            <span className="table-inline-note table-inline-note--error">{brand.processing_error}</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="table-mode-cell" onClick={(event) => event.stopPropagation()}>
                          {brand.processed && (
                            <div className="brands-research-type">
                              <span className="brands-research-type__label">Current: {RESEARCH_MODE_LABELS[brand.processing_research_mode || 'short'] || 'Short research'}</span>
                            </div>
                          )}
                          <select
                            className="form-select form-select--compact brands-row-mode-select"
                            value={selectedMode}
                            disabled={!canProcess}
                            onChange={(event) => setRowResearchModes((prev) => ({ ...prev, [uId]: event.target.value }))}
                          >
                            {RESEARCH_MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${brand.distributors_found ? 'green' : 'gray'}`}>
                          {brand.distributors_found ? `${distCount} found` : 'None'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${brand.emails_found ? 'blue' : 'gray'}`}>
                          {brand.emails_found ? 'Found' : 'Missing'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${outreach.tone}`}>
                          {outreach.label}
                        </span>
                      </td>
                      <td>{brand.processed_at ? new Date(brand.processed_at).toLocaleDateString() : (brand.created_at ? new Date(brand.created_at).toLocaleDateString() : 'Just now')}</td>
                      <td>
                        <div className="table-row-actions" onClick={(event) => event.stopPropagation()}>
                          {canProcess && (
                            <button className="btn-primary table-action-button" type="button" onClick={() => handleProcessBrand(brand)} disabled={!canProcess}>
                              {isProcessing ? 'Queueing...' : <><Play size={13} /> {brand.processed ? 'Reprocess' : 'Process'}</>}
                            </button>
                          )}
                          {canStop && (
                            <button className="btn-primary btn-secondary table-action-button" type="button" onClick={() => handleCancelBrand(brand)} disabled={!canStop}>
                              {isCancelling ? 'Stopping...' : <><Square size={13} /> Stop</>}
                            </button>
                          )}
                          <button className="btn-primary btn-secondary table-action-button" type="button" onClick={() => openEditBrand(brand)}>
                            <Pencil size={13} /> Edit
                          </button>
                          <button className="btn-primary btn-danger table-action-button" type="button" onClick={() => requestDeleteProcessedBrand(brand)} disabled={!!deletingBrands[uId] || isProcessing || isCancelling}>
                            {deletingBrands[uId] ? 'Deleting...' : <><Trash2 size={13} /> Delete</>}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && !error && totalBrands > 0 && (
        <Pagination
          className="surface-card"
          currentPage={currentPage}
          totalPages={totalPages}
          disabled={loading}
          onPageChange={setCurrentPage}
          pageSize={pageSize}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={setPageSize}
        />
      )}

      {selectedBrand && (
        <>
          <div className="detail-backdrop" onClick={() => setSelectedBrand(null)} />
          <section className="detail-modal" role="dialog" aria-modal="true">
            <div className="detail-modal__header">
              <div>
                <span className="eyebrow">Brand details</span>
                <h3>{selectedBrand.brand}</h3>
                <p>
                  {selectedBrand.country}
                  {selectedBrand.parent_company ? ` - ${selectedBrand.parent_company}` : ''}
                </p>
                {selectedBrand.product_context && <p className="detail-subnote">Reference product: {selectedBrand.product_context}</p>}
              </div>
              <button type="button" className="icon-button" onClick={() => setSelectedBrand(null)}>
                <X size={18} />
              </button>
            </div>

            <div className="detail-modal__body">
              <div className="detail-modal__status">
                <span className={`badge ${selectedBrand.distributors_found ? 'green' : 'gray'}`}>
                  {selectedBrand.distributors_found
                    ? `${selectedBrand.distributors?.length || 0} distributors`
                    : 'No distributors'}
                </span>
                <span className={`badge ${selectedBrand.emails_found ? 'blue' : 'gray'}`}>
                  {selectedBrand.emails_found ? 'Brand email available' : 'No brand email'}
                </span>
                <span className={`badge ${selectedBrand.email_sent ? 'purple' : 'gray'}`}>
                  {selectedBrand.email_sent ? 'Brand email sent' : 'Brand email not sent'}
                </span>
                <span className={`badge ${hasActiveDistributorOutreach ? 'amber' : hasSentDistributorOutreach ? 'purple' : 'gray'}`}>
                  {hasActiveDistributorOutreach
                    ? 'Distributor outreach active'
                    : hasSentDistributorOutreach
                      ? (allDistributorEmailsAlreadySent ? 'Distributor outreach sent' : 'Distributor outreach partially sent')
                      : 'Distributor outreach not sent'}
                </span>
              </div>

              <div className="compact-section-list">
                {compactDetails.map(({ title, icon: Icon, items }) => (
                  <section key={title} className="compact-section">
                    <div className="detail-group__title"><Icon size={16} /> {title}</div>
                    <div className="compact-info-grid">
                      {items.map((item) => (
                        <div key={item.label} className="compact-info-card">
                          <label>{item.label}</label>
                          <div className="val compact-info-card__value">
                            {item.mailtoList
                              ? item.values.length > 0
                                ? item.values.map((value) => (
                                    <a key={value} href={`mailto:${value}`}>{value}</a>
                                  ))
                                : <>
                                    <span className="null">Not found</span>
                                    {item.note && <span className="detail-note">{item.note}</span>}
                                  </>
                              : item.value
                                ? item.href
                                  ? (
                                    <a
                                      href={item.href}
                                      target={item.href.startsWith('http') ? '_blank' : undefined}
                                      rel={item.href.startsWith('http') ? 'noreferrer' : undefined}
                                    >
                                      {item.value}
                                    </a>
                                  )
                                  : item.value
                                : <>
                                    <span className="null">Not found</span>
                                    {item.note && <span className="detail-note">{item.note}</span>}
                                  </>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>

              <div className="detail-action-card detail-action-card--compact">
                <div>
                  <h4>Review brand verification email</h4>
                  <p>Open the drafted message, adjust the copy if needed, and only send it once it looks exactly right.</p>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => openBrandEmailComposer(selectedBrand)}
                  disabled={emailingBrands[selectedBrand._id || selectedBrand.id] || selectedBrand.email_sent}
                >
                  {emailingBrands[selectedBrand._id || selectedBrand.id]
                    ? 'Sending...'
                    : selectedBrand.email_sent
                      ? 'Email Already Sent'
                      : 'Review Before Sending'}
                </button>
              </div>

              <div className="detail-action-card detail-action-card--compact detail-action-card--outreach">
                <div>
                  <h4>Review distributor outreach campaign</h4>
                  <p>
                    Inspect every distributor email, edit any subject or body, and approve the campaign only when it is ready to queue.
                  </p>
                </div>
                <button
                  className="btn-primary"
                  onClick={() => openDistributorComposer(selectedBrand)}
                  disabled={queueingCampaigns[selectedBrandId] || remainingDistributorEmailCount === 0 || hasActiveDistributorOutreach || allDistributorEmailsAlreadySent}
                >
                  {queueingCampaigns[selectedBrandId]
                    ? 'Queueing...'
                    : hasSentDistributorOutreach
                      ? 'Partial emails sent'
                      : hasActiveDistributorOutreach
                        ? 'Campaign already active'
                        : selectedBrandDistributorEmailCount === 0
                          ? 'No distributor emails'
                          : <><Send size={14} /> Review Campaign</>}
                </button>
              </div>

              {(selectedBrand.latest_distributor_outreach || selectedCampaign) && (
                <div className="outreach-status-card surface-card">
                  <div className="detail-group__title"><Mail size={16} /> Latest distributor outreach campaign</div>
                  <div className="outreach-status-grid">
                    <div className="compact-info-card">
                      <label>Status</label>
                      <div className="val">{selectedCampaign?.status || selectedBrand.latest_distributor_outreach?.status || 'queued'}</div>
                    </div>
                    <div className="compact-info-card">
                      <label>Total targets</label>
                      <div className="val">{selectedCampaign?.total_targets ?? selectedBrand.latest_distributor_outreach?.total_targets ?? 0}</div>
                    </div>
                    <div className="compact-info-card">
                      <label>Queued / active</label>
                      <div className="val">{selectedCampaign?.queued_targets ?? selectedBrand.latest_distributor_outreach?.queued_targets ?? 0}</div>
                    </div>
                    <div className="compact-info-card">
                      <label>Sent</label>
                      <div className="val">{selectedCampaign?.sent_targets ?? selectedBrand.latest_distributor_outreach?.sent_targets ?? 0}</div>
                    </div>
                    <div className="compact-info-card">
                      <label>Failed</label>
                      <div className="val">{selectedCampaign?.failed_targets ?? selectedBrand.latest_distributor_outreach?.failed_targets ?? 0}</div>
                    </div>
                    <div className="compact-info-card">
                      <label>Already sent</label>
                      <div className="val">{selectedCampaign?.skipped_targets ?? selectedBrand.latest_distributor_outreach?.skipped_targets ?? 0}</div>
                    </div>
                  </div>
                </div>
              )}

              <div className="detail-group">
                <div className="detail-group__title"><ExternalLink size={16} /> Distributors</div>
                {(selectedBrand.distributors || []).length > 0 ? (
                  <div className="dist-list dist-list--compact">
                    {selectedBrand.distributors.map((dist, index) => (
                      <div key={index} className="dist-row dist-row--simple">
                        <div>
                          <div className="dist-name">{dist.name}</div>
                          <div className="dist-loc">
                            {[dist.address, dist.city, dist.state, dist.postal_code, dist.country].filter(Boolean).join(', ') || 'Location not found'}
                          </div>
                        </div>
                        <div className="dist-contact dist-contact--simple">
                          {dist.email && <a href={`mailto:${dist.email}`}>{dist.email}</a>}
                          {!dist.email && (
                            <div className="dist-contact__missing">
                              {dist.email_unavailable_reason && (
                                <span className="dist-contact__empty">{dist.email_unavailable_reason}</span>
                              )}
                              {dist.contact_page && (
                                <a href={dist.contact_page} target="_blank" rel="noreferrer" className="dist-contact__link-note">
                                  Contact page
                                </a>
                              )}
                            </div>
                          )}
                          {dist.phone && <a href={`tel:${dist.phone}`}>{dist.phone}</a>}
                          {!dist.email && !dist.phone && !dist.email_unavailable_reason && !dist.contact_page && (
                            <span className="dist-contact__empty">No contact info found</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-inline">No distributors found for this brand.</div>
                )}
              </div>
            </div>
          </section>
        </>
      )}
      {editorState.open && editorState.form && (
        <>
          <div className="composer-backdrop" onClick={closeEditor} />
          <section className="composer-modal brand-editor-modal" role="dialog" aria-modal="true">
            <div className="composer-modal__header">
              <div>
                <span className="eyebrow">Brand editor</span>
                <h3>Edit brand and distributor details</h3>
                <p>{editorState.form.brand || 'Brand record'}</p>
              </div>
              <button type="button" className="icon-button" onClick={closeEditor}>
                <X size={18} />
              </button>
            </div>

            <div className={`composer-modal__body ${composerState.type === 'distributors' ? 'composer-modal__body--split' : ''}`}>
              {editorState.error && (
                <div className="settings-alert settings-alert--error">{editorState.error}</div>
              )}

              <div className="brand-editor-grid">
                <label className="composer-field"><span>Brand</span><input className="form-input" value={editorState.form.brand} onChange={(e) => updateEditorField('brand', e.target.value)} /></label>
                <label className="composer-field"><span>Country</span><input className="form-input" value={editorState.form.country} onChange={(e) => updateEditorField('country', e.target.value)} /></label>
                <label className="composer-field"><span>Reference product context</span><input className="form-input" value={editorState.form.product_context} onChange={(e) => updateEditorField('product_context', e.target.value)} placeholder="Example: portable band saw blades" /></label>
                <label className="composer-field"><span>Parent company</span><input className="form-input" value={editorState.form.parent_company} onChange={(e) => updateEditorField('parent_company', e.target.value)} /></label>
                <label className="composer-field"><span>Official website</span><input className="form-input" value={editorState.form.official_website} onChange={(e) => updateEditorField('official_website', e.target.value)} /></label>
                <label className="composer-field"><span>Brand address</span><input className="form-input" value={editorState.form.brand_address} onChange={(e) => updateEditorField('brand_address', e.target.value)} /></label>
                <label className="composer-field"><span>Brand postal code</span><input className="form-input" value={editorState.form.brand_postal_code} onChange={(e) => updateEditorField('brand_postal_code', e.target.value)} /></label>
                <label className="composer-field"><span>Brand contact page</span><input className="form-input" value={editorState.form.brand_contact_page} onChange={(e) => updateEditorField('brand_contact_page', e.target.value)} /></label>
                <label className="composer-field"><span>Parent contact page</span><input className="form-input" value={editorState.form.parent_company_contact_page} onChange={(e) => updateEditorField('parent_company_contact_page', e.target.value)} /></label>
                <label className="composer-field"><span>Brand phone</span><input className="form-input" value={editorState.form.brand_phone} onChange={(e) => updateEditorField('brand_phone', e.target.value)} /></label>
                <label className="composer-field"><span>Parent company phone</span><input className="form-input" value={editorState.form.parent_company_phone} onChange={(e) => updateEditorField('parent_company_phone', e.target.value)} /></label>
                <label className="composer-field"><span>Parent company email</span><input className="form-input" value={editorState.form.parent_company_email} onChange={(e) => updateEditorField('parent_company_email', e.target.value)} /></label>
                <label className="composer-field"><span>Parent email type</span><input className="form-input" value={editorState.form.parent_company_email_type} onChange={(e) => updateEditorField('parent_company_email_type', e.target.value)} /></label>
                <label className="composer-field"><span>Brand email note</span><input className="form-input" value={editorState.form.brand_email_unavailable_reason} onChange={(e) => updateEditorField('brand_email_unavailable_reason', e.target.value)} /></label>
                <label className="composer-field"><span>Parent email note</span><input className="form-input" value={editorState.form.parent_company_email_unavailable_reason} onChange={(e) => updateEditorField('parent_company_email_unavailable_reason', e.target.value)} /></label>
                <label className="composer-field composer-field--full"><span>Brand emails</span><textarea className="composer-textarea brand-editor-textarea" value={editorState.form.brand_emails_text} onChange={(e) => updateEditorField('brand_emails_text', e.target.value)} /></label>
              </div>

              <div className="brand-editor-section">
                <div className="brand-editor-section__header">
                  <div>
                    <span className="eyebrow">Distributors</span>
                    <h4>Edit distributor rows</h4>
                  </div>
                  <button className="btn-primary btn-secondary" type="button" onClick={addDistributorRow}>Add Distributor</button>
                </div>
                <div className="brand-editor-list">
                  {editorState.form.distributors.map((dist, index) => (
                    <div key={`${dist.name || 'distributor'}-${index}`} className="brand-editor-card">
                      <div className="brand-editor-card__header">
                        <strong>{dist.name || `Distributor ${index + 1}`}</strong>
                        <button className="btn-primary btn-danger table-action-button" type="button" onClick={() => removeDistributorRow(index)}>
                          <Trash2 size={13} /> Remove
                        </button>
                      </div>
                      <div className="brand-editor-grid brand-editor-grid--distributor">
                        <label className="composer-field"><span>Name</span><input className="form-input" value={dist.name} onChange={(e) => updateEditorDistributorField(index, 'name', e.target.value)} /></label>
                        <label className="composer-field"><span>Website</span><input className="form-input" value={dist.website} onChange={(e) => updateEditorDistributorField(index, 'website', e.target.value)} /></label>
                        <label className="composer-field"><span>Address</span><input className="form-input" value={dist.address} onChange={(e) => updateEditorDistributorField(index, 'address', e.target.value)} /></label>
                        <label className="composer-field"><span>City</span><input className="form-input" value={dist.city} onChange={(e) => updateEditorDistributorField(index, 'city', e.target.value)} /></label>
                        <label className="composer-field"><span>State</span><input className="form-input" value={dist.state} onChange={(e) => updateEditorDistributorField(index, 'state', e.target.value)} /></label>
                        <label className="composer-field"><span>Postal code</span><input className="form-input" value={dist.postal_code} onChange={(e) => updateEditorDistributorField(index, 'postal_code', e.target.value)} /></label>
                        <label className="composer-field"><span>Country</span><input className="form-input" value={dist.country} onChange={(e) => updateEditorDistributorField(index, 'country', e.target.value)} /></label>
                        <label className="composer-field"><span>Email</span><input className="form-input" value={dist.email} onChange={(e) => updateEditorDistributorField(index, 'email', e.target.value)} /></label>
                        <label className="composer-field"><span>Phone</span><input className="form-input" value={dist.phone} onChange={(e) => updateEditorDistributorField(index, 'phone', e.target.value)} /></label>
                        <label className="composer-field"><span>Contact page</span><input className="form-input" value={dist.contact_page} onChange={(e) => updateEditorDistributorField(index, 'contact_page', e.target.value)} /></label>
                        <label className="composer-field"><span>Email note</span><input className="form-input" value={dist.email_unavailable_reason} onChange={(e) => updateEditorDistributorField(index, 'email_unavailable_reason', e.target.value)} /></label>
                        <label className="composer-field"><span>Source</span><input className="form-input" value={dist.source} onChange={(e) => updateEditorDistributorField(index, 'source', e.target.value)} /></label>
                        <label className="composer-field"><span>Confidence</span><input className="form-input" type="number" min="0" max="100" value={dist.confidence} onChange={(e) => updateEditorDistributorField(index, 'confidence', e.target.value)} /></label>
                        <label className="brand-editor-check"><input type="checkbox" checked={dist.official} onChange={(e) => updateEditorDistributorField(index, 'official', e.target.checked)} /> Official</label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="composer-modal__footer">
              <button className="btn-primary btn-secondary" type="button" onClick={closeEditor} disabled={editorState.saving}>Cancel</button>
              <button className="btn-primary" type="button" onClick={saveEditedBrand} disabled={editorState.saving}>
                {editorState.saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </section>
        </>
      )}


      {confirmDelete.open && confirmDelete.brand && (
        <>
          <div className="composer-backdrop" onClick={closeDeleteDialog} />
          <section className="confirm-dialog" role="dialog" aria-modal="true">
            <div className="confirm-dialog__body">
              <span className="eyebrow">Delete brand</span>
              <h3>Delete this brand record?</h3>
              <p><strong>{confirmDelete.brand.brand}</strong> will be removed from the active workspace, along with its processed details and outreach view.</p>
            </div>
            <div className="confirm-dialog__footer">
              <button className="btn-primary btn-secondary" type="button" onClick={closeDeleteDialog} disabled={!!deletingBrands[confirmDelete.brand._id || confirmDelete.brand.id]}>Cancel</button>
              <button className="btn-primary btn-danger" type="button" onClick={() => deleteProcessedBrand(confirmDelete.brand)} disabled={!!deletingBrands[confirmDelete.brand._id || confirmDelete.brand.id]}>
                {!!deletingBrands[confirmDelete.brand._id || confirmDelete.brand.id] ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </section>
        </>
      )}

      {composerState.open && (
        <>
          <div className="composer-backdrop" onClick={closeComposer} />
          <section className="composer-modal" role="dialog" aria-modal="true">
            <div className="composer-modal__header">
              <div>
                <span className="eyebrow">Outreach review</span>
                <h3>{composerState.type === 'brand' ? 'Approve brand email' : 'Approve distributor outreach'}</h3>
                <p>{composerState.brandName}</p>
              </div>
              <button type="button" className="icon-button" onClick={closeComposer}>
                <X size={18} />
              </button>
            </div>

            <div className="composer-modal__body">
              {composerState.loading && (
                <div className="empty-state composer-empty-state">
                  <div className="spinner spin-center"></div>
                  <h3>Preparing draft</h3>
                  <p>Loading the current outreach message for review.</p>
                </div>
              )}

              {!composerState.loading && composerState.error && (
                <div className="settings-alert settings-alert--error">{composerState.error}</div>
              )}

              {!composerState.loading && !composerState.error && composerState.type === 'brand' && composerState.draft && (
                <div className="composer-single">
                  <div className="composer-summary-card">
                    <div className="composer-summary-card__row">
                      <span>Recipient type</span>
                      <strong>{composerState.draft.email_type === 'parent' ? 'Parent company email' : 'Brand email'}</strong>
                    </div>
                    <div className="composer-summary-card__row">
                      <span>Brand</span>
                      <strong>{composerState.draft.brand_name}</strong>
                    </div>
                  </div>
                  <div className="composer-editor-card">
                    <label className="composer-field">
                      <span>To</span>
                      <input className="form-input" type="email" value={composerState.draft.to_email} onChange={(e) => updateBrandDraftField('to_email', e.target.value)} />
                    </label>
                    <label className="composer-field">
                      <span>Subject</span>
                      <input className="form-input" type="text" value={composerState.draft.subject} onChange={(e) => updateBrandDraftField('subject', e.target.value)} />
                    </label>
                    <label className="composer-field composer-field--grow">
                      <span>Body</span>
                      <textarea className="composer-textarea" value={composerState.draft.body} onChange={(e) => updateBrandDraftField('body', e.target.value)} />
                    </label>
                  </div>
                </div>
              )}

              {!composerState.loading && !composerState.error && composerState.type === 'distributors' && composerState.draft && (
                <div className="composer-layout">
                  <aside className="composer-sidebar">
                    <div className="composer-sidebar__summary">
                      <div><span>Total drafts</span><strong>{composerState.draft.total_targets}</strong></div>
                      <div><span>Ready to send</span><strong>{composerState.draft.ready_targets}</strong></div>
                      <div><span>Missing email</span><strong>{composerState.draft.missing_email_targets}</strong></div>
                    </div>
                    <div className="composer-sidebar__actions">
                      <div className="composer-selection-meta">
                        <span>Selected</span>
                        <strong>{distributorDraftSelectionSummary.selectedCount} of {distributorDraftSelectionSummary.readyCount} ready</strong>
                      </div>
                      <div className="composer-selection-buttons">
                        <button type="button" className="btn-primary btn-secondary" onClick={() => setAllDistributorDraftSelections(true)}>
                          Select all
                        </button>
                        <button type="button" className="btn-primary btn-secondary" onClick={() => setAllDistributorDraftSelections(false)}>
                          Unselect all
                        </button>
                      </div>
                    </div>
                    <div className="composer-recipient-list">
                      {composerState.draft.drafts.map((draft, index) => (
                        <button
                          key={`${draft.distributor_name}-${index}`}
                          type="button"
                          className={`composer-recipient ${composerState.selectedDraftIndex === index ? 'active' : ''} ${draft.status === 'ready' && draft.selected ? 'selected' : ''}`}
                          onClick={() => setComposerState((prev) => ({ ...prev, selectedDraftIndex: index }))}
                        >
                          <div className="composer-recipient__main">
                            <label className={`composer-recipient__check ${draft.status !== 'ready' ? 'disabled' : ''}`} onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={draft.status === 'ready' ? !!draft.selected : false}
                                disabled={draft.status !== 'ready'}
                                onChange={() => toggleDistributorDraftSelection(index)}
                              />
                              <span className="composer-recipient__indicator" />
                            </label>
                            <div>
                              <strong>{draft.distributor_name}</strong>
                              <span>{draft.to_email || draft.reason || 'No email available'}</span>
                            </div>
                          </div>
                          <span className={`badge ${draft.status === 'ready' ? 'blue' : 'gray'}`}>{draft.status === 'ready' ? 'Ready' : draft.status === 'already_sent' ? 'Already sent' : 'Skipped'}</span>
                        </button>
                      ))}
                    </div>
                  </aside>

                  <div className="composer-editor-card composer-editor-card--wide composer-editor-card--sticky">
                    {selectedDistributorDraft && (
                      <>
                        <div className="composer-summary-card composer-summary-card--inline">
                          <div className="composer-summary-card__row"><span>Distributor</span><strong>{selectedDistributorDraft.distributor_name}</strong></div>
                          <div className="composer-summary-card__row"><span>Status</span><strong>{selectedDistributorDraft.status === 'ready' ? 'Ready to send' : 'Missing email'}</strong></div>
                        </div>
                        <label className="composer-field">
                          <span>To</span>
                          <input className="form-input" type="email" value={selectedDistributorDraft.to_email || ''} onChange={(e) => updateDistributorDraftField(composerState.selectedDraftIndex, 'to_email', e.target.value)} />
                        </label>
                        <label className="composer-field">
                          <span>Subject</span>
                          <input className="form-input" type="text" value={selectedDistributorDraft.subject} onChange={(e) => updateDistributorDraftField(composerState.selectedDraftIndex, 'subject', e.target.value)} />
                        </label>
                        <label className="composer-field composer-field--grow">
                          <span>Body</span>
                          <textarea className="composer-textarea" value={selectedDistributorDraft.body} onChange={(e) => updateDistributorDraftField(composerState.selectedDraftIndex, 'body', e.target.value)} />
                        </label>
                        {selectedDistributorDraft.reason && <div className="composer-note">{selectedDistributorDraft.reason}</div>}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="composer-modal__footer">
              <button className="btn-primary btn-secondary" type="button" onClick={closeComposer} disabled={composerState.saving}>Cancel</button>
              <button className="btn-primary" type="button" onClick={composerState.type === 'brand' ? approveBrandEmail : approveDistributorOutreach} disabled={composerState.saving || composerState.loading || !!composerState.error}>
                {composerState.saving ? 'Sending...' : composerState.type === 'brand' ? 'Approve and Send' : 'Approve and Queue Campaign'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default Brands;






