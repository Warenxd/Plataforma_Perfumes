from django import template

register = template.Library()

def _fmt(value):
    try:
        value_int = int(value)
    except (TypeError, ValueError):
        return value
    return f"{value_int:,}".replace(",", ".")


@register.filter
def clp(value):
    """
    Formatea número en CLP con puntos como separador de miles.
    """
    return _fmt(value)


@register.filter(name="format_price")
def format_price(value):
    """
    Alias de clp para plantillas existentes.
    """
    return _fmt(value)
