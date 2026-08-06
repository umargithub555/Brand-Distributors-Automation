from fastapi import APIRouter, Depends

from backend.models.schemas import (
    AdminProfileResponse,
    AuthChangePasswordRequest,
    AuthForgotPasswordRequest,
    AuthLoginRequest,
    AuthLoginResponse,
    AuthResetPasswordRequest,
    BasicMessageResponse,
)
from backend.services.auth import (
    authenticate_admin,
    change_password,
    get_current_admin_profile,
    logout_admin,
    request_password_reset,
    require_admin,
    reset_password_with_otp,
)

router = APIRouter(tags=['auth'])


@router.post('/auth/login', response_model=AuthLoginResponse)
def login_admin(payload: AuthLoginRequest):
    return authenticate_admin(payload.email, payload.password)


@router.get('/auth/me', response_model=AdminProfileResponse)
def fetch_current_admin(auth_context=Depends(require_admin)):
    return get_current_admin_profile(auth_context)


@router.post('/auth/logout', response_model=BasicMessageResponse)
def logout_current_admin(auth_context=Depends(require_admin)):
    return logout_admin(auth_context['token'])


@router.post('/auth/forgot-password', response_model=BasicMessageResponse)
async def send_reset_otp(payload: AuthForgotPasswordRequest):
    return await request_password_reset(payload.email)


@router.post('/auth/reset-password', response_model=BasicMessageResponse)
def reset_admin_password(payload: AuthResetPasswordRequest):
    return reset_password_with_otp(payload.email, payload.otp, payload.new_password)


@router.post('/auth/change-password')
def change_admin_password(payload: AuthChangePasswordRequest, auth_context=Depends(require_admin)):
    return change_password(auth_context, payload.current_password, payload.new_password)
