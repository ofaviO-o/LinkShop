"""add mercado livre catalog architecture v1

Revision ID: 0005_mercado_livre_catalog_v1
Revises: 0004_click_event_context
Create Date: 2026-04-22
"""

from alembic import op
import sqlalchemy as sa


revision = "0005_mercado_livre_catalog_v1"
down_revision = "0004_click_event_context"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("products", sa.Column("title", sa.String(length=255), nullable=True))
    op.add_column("products", sa.Column("marketplace", sa.String(length=60), nullable=True))
    op.add_column("products", sa.Column("external_id", sa.String(length=120), nullable=True))
    op.add_column("products", sa.Column("category_id", sa.String(length=120), nullable=True))
    op.add_column("products", sa.Column("canonical_url", sa.String(length=2000), nullable=True))
    op.add_column("products", sa.Column("condition", sa.String(length=40), nullable=True))
    op.add_column("products", sa.Column("currency_id", sa.String(length=10), nullable=True))
    op.add_column("products", sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_products_marketplace", "products", ["marketplace"], unique=False)
    op.create_index("ix_products_marketplace_external_id", "products", ["marketplace", "external_id"], unique=False)
    op.create_unique_constraint("uq_products_marketplace_external", "products", ["marketplace", "external_id"])

    op.add_column("offers", sa.Column("marketplace", sa.String(length=60), nullable=True))
    op.add_column("offers", sa.Column("seller_id", sa.String(length=120), nullable=True))
    op.add_column("offers", sa.Column("product_url", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("available_quantity", sa.Integer(), nullable=True))
    op.add_column("offers", sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_offers_marketplace", "offers", ["marketplace"], unique=False)

    op.create_table(
        "affiliate_link_cache",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("marketplace", sa.String(length=60), nullable=False),
        sa.Column("external_id", sa.String(length=120), nullable=False),
        sa.Column("original_url", sa.Text(), nullable=False),
        sa.Column("affiliate_url", sa.Text(), nullable=False),
        sa.Column("provider", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name="pk_affiliate_link_cache"),
    )
    op.create_index(
        "ix_affiliate_link_cache_marketplace_external_id",
        "affiliate_link_cache",
        ["marketplace", "external_id"],
        unique=False,
    )
    op.create_index("ix_affiliate_link_cache_expires_at", "affiliate_link_cache", ["expires_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_affiliate_link_cache_expires_at", table_name="affiliate_link_cache")
    op.drop_index("ix_affiliate_link_cache_marketplace_external_id", table_name="affiliate_link_cache")
    op.drop_table("affiliate_link_cache")

    op.drop_index("ix_offers_marketplace", table_name="offers")
    op.drop_column("offers", "fetched_at")
    op.drop_column("offers", "available_quantity")
    op.drop_column("offers", "product_url")
    op.drop_column("offers", "seller_id")
    op.drop_column("offers", "marketplace")

    op.drop_constraint("uq_products_marketplace_external", "products", type_="unique")
    op.drop_index("ix_products_marketplace_external_id", table_name="products")
    op.drop_index("ix_products_marketplace", table_name="products")
    op.drop_column("products", "last_synced_at")
    op.drop_column("products", "currency_id")
    op.drop_column("products", "condition")
    op.drop_column("products", "canonical_url")
    op.drop_column("products", "category_id")
    op.drop_column("products", "external_id")
    op.drop_column("products", "marketplace")
    op.drop_column("products", "title")
