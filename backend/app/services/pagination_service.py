from typing import TypeVar


T = TypeVar("T")


class PaginationService:
    @staticmethod
    def normalize(page: int, page_size: int) -> tuple[int, int]:
        normalized_page = max(page, 1)
        normalized_page_size = max(min(page_size, 100), 1)
        return normalized_page, normalized_page_size

    @staticmethod
    def slice_items(items: list[T], page: int, page_size: int) -> tuple[list[T], int]:
        normalized_page, normalized_page_size = PaginationService.normalize(page, page_size)
        total = len(items)
        start = (normalized_page - 1) * normalized_page_size
        end = start + normalized_page_size
        return items[start:end], total
