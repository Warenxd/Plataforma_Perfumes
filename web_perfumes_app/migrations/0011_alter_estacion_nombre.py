from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('web_perfumes_app', '0010_estacion_porcentaje'),
    ]

    operations = [
        migrations.AlterField(
            model_name='estacion',
            name='nombre',
            field=models.CharField(max_length=50),
        ),
    ]
