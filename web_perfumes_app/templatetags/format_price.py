from django import template

register = template.Library()

@register.filter
def clp(value):
    try:
        value_int = int(value)
    except (TypeError, ValueError):
        return value
    # 94990 -> "94,990" -> "94.990"
    return f"{value_int:,}".replace(",", ".")