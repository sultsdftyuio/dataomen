try:
    from flask import Blueprint, request, jsonify
except Exception:
    # Fallbacks for editor/static-analysis environments where Flask
    # isn't installed. At runtime Flask should be available.
    from types import SimpleNamespace
    Blueprint = lambda *a, **k: SimpleNamespace()
    request = SimpleNamespace(args={}, environ={})
    def jsonify(obj):
        return obj
from functools import wraps
import logging

from api.services.user_drilldown import UserDrilldownService

logger = logging.getLogger(__name__)

query_bp = Blueprint('query', __name__)

def require_tenant(f):
    """
    Middleware decorator to strictly enforce tenant isolation.
    Extracts tenant_id from the verified auth context (e.g., JWT).
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # 🚨 Architect Note: Replace this extraction logic with your actual auth mechanism 
        # (e.g., pulling from a parsed JWT in request.environ or headers).
        # NEVER trust a raw 'tenant_id' passed directly in a query param by the client.
        tenant_id = request.environ.get('authenticated_tenant_id')
        
        if not tenant_id:
            logger.warning("Unauthorized access attempt: Missing authenticated_tenant_id")
            return jsonify({"error": "Unauthorized"}), 401
            
        return f(tenant_id=tenant_id, *args, **kwargs)
    return decorated_function


@query_bp.route('/metrics/<event_name>/affected_users', methods=['GET'])
@require_tenant
def get_affected_users(tenant_id: str, event_name: str):
    """
    Retrieves a paginated list of users affected by an anomaly for a specific metric.
    
    Query Params:
    - date (YYYY-MM-DD): Required. The date of the anomaly.
    - segment_key: Optional. E.g., 'device'
    - segment_value: Optional. E.g., 'mobile'
    - limit: Optional. Default 100, Max 1000.
    - cursor: Optional. The last_seen_user_id from the previous page.
    """
    target_date = request.args.get('date')
    if not target_date:
        return jsonify({"error": "Missing required parameter 'date'."}), 400

    segment_key = request.args.get('segment_key')
    segment_value = request.args.get('segment_value')
    cursor = request.args.get('cursor')
    
    # Safety: Enforce strict pagination limits to prevent DB DOS
    try:
        limit = int(request.args.get('limit', 100))
        limit = max(1, min(limit, 1000)) # Hard clamp between 1 and 1000
    except ValueError:
        return jsonify({"error": "Invalid limit parameter. Must be an integer."}), 400

    try:
        # Pass the explicitly authenticated tenant_id to the service layer
        result = UserDrilldownService.get_affected_users_paginated(
            tenant_id=tenant_id,
            event_name=event_name,
            target_date=target_date,
            segment_key=segment_key,
            segment_value=segment_value,
            limit=limit,
            last_seen_user_id=cursor
        )
        return jsonify(result), 200
        
    except Exception as e:
        logger.error(f"Error fetching affected users for {tenant_id} / {event_name}: {str(e)}")
        return jsonify({"error": "Failed to process drilldown request."}), 500